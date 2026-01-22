/**
 * Auto-Description Engine
 * Automatyczne sugestie kategorii i opisów na podstawie historii i reguł
 */

class AutoDescribeEngine {
  constructor(options = {}) {
    this.store = options.store || null;
    this.rules = new Map();
    this.contractorHistory = new Map();
    
    // Domyślne kategorie kosztów
    this.defaultCategories = [
      { id: 'fuel', name: 'Paliwo', keywords: ['bp', 'orlen', 'shell', 'paliwo', 'tankowanie'] },
      { id: 'office', name: 'Materiały biurowe', keywords: ['papier', 'toner', 'biuro', 'ikea'] },
      { id: 'telecom', name: 'Telekomunikacja', keywords: ['orange', 'play', 't-mobile', 'plus', 'internet', 'telefon'] },
      { id: 'hosting', name: 'Hosting/IT', keywords: ['ovh', 'aws', 'azure', 'google cloud', 'hosting', 'domena', 'ssl'] },
      { id: 'marketing', name: 'Marketing', keywords: ['facebook', 'google ads', 'reklama', 'druk', 'ulotki'] },
      { id: 'subscription', name: 'Subskrypcje', keywords: ['spotify', 'netflix', 'adobe', 'microsoft', 'slack'] },
      { id: 'travel', name: 'Podróże służbowe', keywords: ['hotel', 'bilet', 'lot', 'ryanair', 'booking'] },
      { id: 'equipment', name: 'Sprzęt', keywords: ['komputronik', 'x-kom', 'morele', 'laptop', 'monitor'] },
      { id: 'services', name: 'Usługi', keywords: ['konsulting', 'doradztwo', 'usługa'] },
      { id: 'other', name: 'Inne', keywords: [] }
    ];
  }

  /**
   * Zasugeruj opis dla faktury
   */
  async suggest(invoiceData) {
    const suggestions = {
      category: null,
      mpk: null,
      confidence: 0,
      basedOnHistory: 0,
      alternatives: []
    };
    
    // 1. Sprawdź historię kontrahenta
    const historyMatch = await this._matchFromHistory(invoiceData);
    if (historyMatch && historyMatch.confidence >= 80) {
      return historyMatch;
    }
    
    // 2. Sprawdź reguły użytkownika
    const ruleMatch = this._matchFromRules(invoiceData);
    if (ruleMatch && ruleMatch.confidence >= 70) {
      return ruleMatch;
    }
    
    // 3. Dopasuj po słowach kluczowych
    const keywordMatch = this._matchFromKeywords(invoiceData);
    if (keywordMatch) {
      suggestions.category = keywordMatch.category;
      suggestions.confidence = keywordMatch.confidence;
      suggestions.alternatives = keywordMatch.alternatives;
    }
    
    // 4. Jeśli nadal nic - zaproponuj na podstawie kwoty
    if (!suggestions.category) {
      suggestions.category = this._guessFromAmount(invoiceData.amounts?.gross);
      suggestions.confidence = 20;
    }
    
    return suggestions;
  }

  /**
   * Ucz się z zatwierdzonych faktur
   */
  async learnFromApproved(invoiceData, description) {
    const contractorKey = this._getContractorKey(invoiceData);
    
    if (!contractorKey) return;
    
    // Pobierz lub utwórz historię
    let history = this.contractorHistory.get(contractorKey) || {
      contractor: {
        name: invoiceData.seller?.name,
        nip: invoiceData.seller?.nip
      },
      descriptions: [],
      mostCommon: null
    };
    
    // Dodaj nowy wpis
    history.descriptions.push({
      category: description.category,
      mpk: description.mpk,
      amount: invoiceData.amounts?.gross,
      date: new Date()
    });
    
    // Oblicz najczęstszą kategorię
    history.mostCommon = this._findMostCommon(history.descriptions);
    
    this.contractorHistory.set(contractorKey, history);
    
    // Zapisz do store jeśli dostępny
    if (this.store) {
      await this.store.saveContractorHistory(contractorKey, history);
    }
  }

  /**
   * Dodaj regułę użytkownika
   */
  addRule(rule) {
    const ruleId = rule.id || `rule_${Date.now()}`;
    
    this.rules.set(ruleId, {
      id: ruleId,
      name: rule.name,
      conditions: rule.conditions, // { nip, nameContains, amountMin, amountMax }
      result: rule.result,         // { category, mpk }
      priority: rule.priority || 50,
      enabled: true
    });
    
    return ruleId;
  }

  /**
   * Pobierz statystyki kategorii
   */
  getCategoryStats() {
    const stats = new Map();
    
    for (const [, history] of this.contractorHistory) {
      for (const desc of history.descriptions) {
        const count = stats.get(desc.category) || 0;
        stats.set(desc.category, count + 1);
      }
    }
    
    return Object.fromEntries(stats);
  }

  // --- Private methods ---

  async _matchFromHistory(invoiceData) {
    const contractorKey = this._getContractorKey(invoiceData);
    if (!contractorKey) return null;
    
    const history = this.contractorHistory.get(contractorKey);
    if (!history || history.descriptions.length === 0) return null;
    
    const mostCommon = history.mostCommon;
    const total = history.descriptions.length;
    const matching = history.descriptions.filter(d => d.category === mostCommon.category).length;
    
    return {
      category: mostCommon.category,
      mpk: mostCommon.mpk,
      confidence: Math.round((matching / total) * 100),
      basedOnHistory: total,
      alternatives: this._getAlternatives(history.descriptions, mostCommon.category)
    };
  }

  _matchFromRules(invoiceData) {
    const matchingRules = [];
    
    for (const [, rule] of this.rules) {
      if (!rule.enabled) continue;
      
      if (this._ruleMatches(rule.conditions, invoiceData)) {
        matchingRules.push(rule);
      }
    }
    
    if (matchingRules.length === 0) return null;
    
    // Sortuj po priorytecie
    matchingRules.sort((a, b) => b.priority - a.priority);
    const bestRule = matchingRules[0];
    
    return {
      category: bestRule.result.category,
      mpk: bestRule.result.mpk,
      confidence: 70 + (bestRule.priority / 5),
      basedOnHistory: 0,
      alternatives: [],
      matchedRule: bestRule.name
    };
  }

  _ruleMatches(conditions, invoiceData) {
    // NIP match
    if (conditions.nip && invoiceData.seller?.nip !== conditions.nip) {
      return false;
    }
    
    // Name contains
    if (conditions.nameContains) {
      const sellerName = (invoiceData.seller?.name || '').toLowerCase();
      if (!sellerName.includes(conditions.nameContains.toLowerCase())) {
        return false;
      }
    }
    
    // Amount range
    const amount = invoiceData.amounts?.gross || 0;
    if (conditions.amountMin && amount < conditions.amountMin) return false;
    if (conditions.amountMax && amount > conditions.amountMax) return false;
    
    return true;
  }

  _matchFromKeywords(invoiceData) {
    const searchText = [
      invoiceData.seller?.name || '',
      invoiceData.items?.map(i => i.description).join(' ') || ''
    ].join(' ').toLowerCase();
    
    const scores = [];
    
    for (const category of this.defaultCategories) {
      let score = 0;
      let matchedKeywords = 0;
      
      for (const keyword of category.keywords) {
        if (searchText.includes(keyword.toLowerCase())) {
          score += 10;
          matchedKeywords++;
        }
      }
      
      if (score > 0) {
        scores.push({
          category: category.id,
          categoryName: category.name,
          score,
          matchedKeywords
        });
      }
    }
    
    if (scores.length === 0) return null;
    
    scores.sort((a, b) => b.score - a.score);
    const best = scores[0];
    
    return {
      category: best.category,
      confidence: Math.min(best.score * 5, 65),
      alternatives: scores.slice(1, 4).map(s => ({
        category: s.category,
        confidence: Math.min(s.score * 5, 65)
      }))
    };
  }

  _guessFromAmount(amount) {
    if (!amount) return 'other';
    
    // Heurystyki na podstawie kwoty
    if (amount < 50) return 'office';
    if (amount < 200) return 'subscription';
    if (amount < 500) return 'services';
    
    return 'other';
  }

  _getContractorKey(invoiceData) {
    if (invoiceData.seller?.nip) {
      return `nip:${invoiceData.seller.nip}`;
    }
    if (invoiceData.seller?.name) {
      return `name:${invoiceData.seller.name.toLowerCase().replace(/\s+/g, '_')}`;
    }
    return null;
  }

  _findMostCommon(descriptions) {
    const counts = {};
    
    for (const desc of descriptions) {
      const key = `${desc.category}|${desc.mpk || ''}`;
      counts[key] = (counts[key] || 0) + 1;
    }
    
    let maxKey = null;
    let maxCount = 0;
    
    for (const [key, count] of Object.entries(counts)) {
      if (count > maxCount) {
        maxCount = count;
        maxKey = key;
      }
    }
    
    if (!maxKey) return null;
    
    const [category, mpk] = maxKey.split('|');
    return { category, mpk: mpk || null };
  }

  _getAlternatives(descriptions, excludeCategory) {
    const counts = {};
    
    for (const desc of descriptions) {
      if (desc.category !== excludeCategory) {
        counts[desc.category] = (counts[desc.category] || 0) + 1;
      }
    }
    
    return Object.entries(counts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([category, count]) => ({
        category,
        count
      }));
  }
}

function createAutoDescribeEngine(options) {
  return new AutoDescribeEngine(options);
}

module.exports = {
  AutoDescribeEngine,
  createAutoDescribeEngine
};
