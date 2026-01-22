const EventEmitter = require('node:events')

const CATEGORIES = {
  HOSTING: 'hosting',
  MARKETING: 'marketing',
  FUEL: 'paliwo',
  OFFICE: 'biuro',
  TELECOM: 'telekomunikacja',
  SOFTWARE: 'oprogramowanie',
  CONSULTING: 'uslugi-doradcze',
  ACCOUNTING: 'ksiegowosc',
  UTILITIES: 'media',
  TRANSPORT: 'transport',
  OTHER: 'inne',
}

class AutoDescribeEngine extends EventEmitter {
  constructor(options = {}) {
    super()
    this.historyStore = options.historyStore || new Map()
    this.rules = options.rules || []
    this.aiEnabled = options.aiEnabled || false
    this.aiConfig = options.aiConfig || null
  }

  async suggest(invoiceData) {
    this.emit('suggesting', { nip: invoiceData.contractorNip })

    const suggestions = []

    const historySuggestion = await this._suggestFromHistory(invoiceData)
    if (historySuggestion) {
      suggestions.push(historySuggestion)
    }

    const ruleSuggestion = this._suggestFromRules(invoiceData)
    if (ruleSuggestion) {
      suggestions.push(ruleSuggestion)
    }

    if (this.aiEnabled) {
      const aiSuggestion = await this._suggestFromAi(invoiceData)
      if (aiSuggestion) {
        suggestions.push(aiSuggestion)
      }
    }

    const best = this._pickBestSuggestion(suggestions)

    this.emit('suggested', { nip: invoiceData.contractorNip, suggestion: best })

    return best
  }

  async _suggestFromHistory(invoiceData) {
    const nip = invoiceData.contractorNip || invoiceData.sellerNip
    if (!nip) {
      return null
    }

    const history = await this.findContractorHistory(nip)
    if (history.length === 0) {
      return null
    }

    const categoryCounts = {}
    const mpkCounts = {}
    const descriptionCounts = {}

    for (const inv of history) {
      if (inv.category) {
        categoryCounts[inv.category] = (categoryCounts[inv.category] || 0) + 1
      }
      if (inv.mpk) {
        mpkCounts[inv.mpk] = (mpkCounts[inv.mpk] || 0) + 1
      }
      if (inv.description) {
        descriptionCounts[inv.description] = (descriptionCounts[inv.description] || 0) + 1
      }
    }

    const topCategory = this._getTopKey(categoryCounts)
    const topMpk = this._getTopKey(mpkCounts)
    const topDescription = this._getTopKey(descriptionCounts)

    const total = history.length
    const categoryConfidence = topCategory ? (categoryCounts[topCategory] / total) * 100 : 0

    return {
      source: 'history',
      category: topCategory,
      mpk: topMpk,
      description: topDescription,
      confidence: Math.round(categoryConfidence),
      basedOn: total,
    }
  }

  _suggestFromRules(invoiceData) {
    for (const rule of this.rules) {
      const match = this._matchRule(rule, invoiceData)
      if (match) {
        return {
          source: 'rule',
          category: rule.category,
          mpk: rule.mpk || null,
          description: rule.description || null,
          confidence: rule.confidence || 80,
          ruleName: rule.name,
        }
      }
    }
    return null
  }

  _matchRule(rule, invoiceData) {
    if (rule.nipPattern) {
      const nip = invoiceData.contractorNip || invoiceData.sellerNip || ''
      if (!nip.match(new RegExp(rule.nipPattern))) {
        return false
      }
    }

    if (rule.namePattern) {
      const name = invoiceData.contractorName || invoiceData.sellerName || ''
      if (!name.toLowerCase().includes(rule.namePattern.toLowerCase())) {
        return false
      }
    }

    if (rule.amountMin !== undefined) {
      const amount = invoiceData.grossAmount || 0
      if (amount < rule.amountMin) {
        return false
      }
    }

    if (rule.amountMax !== undefined) {
      const amount = invoiceData.grossAmount || 0
      if (amount > rule.amountMax) {
        return false
      }
    }

    if (rule.keywords && rule.keywords.length > 0) {
      const text = [
        invoiceData.invoiceNumber,
        invoiceData.contractorName,
        invoiceData.sellerName,
        invoiceData.description,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()

      const hasKeyword = rule.keywords.some((kw) => text.includes(kw.toLowerCase()))
      if (!hasKeyword) {
        return false
      }
    }

    return true
  }

  async _suggestFromAi(invoiceData) {
    if (!this.aiConfig) {
      return null
    }

    // Placeholder - requires OpenAI or similar API
    // const { OpenAI } = require('openai')
    // const client = new OpenAI({ apiKey: this.aiConfig.apiKey })
    // const completion = await client.chat.completions.create({
    //   model: 'gpt-4',
    //   messages: [{ role: 'user', content: `Categorize invoice: ${JSON.stringify(invoiceData)}` }]
    // })

    this.emit('ai:suggest', { data: invoiceData })

    return null
  }

  _pickBestSuggestion(suggestions) {
    if (suggestions.length === 0) {
      return {
        source: 'none',
        category: null,
        mpk: null,
        description: null,
        confidence: 0,
        basedOn: 0,
      }
    }

    suggestions.sort((a, b) => (b.confidence || 0) - (a.confidence || 0))
    return suggestions[0]
  }

  _getTopKey(counts) {
    let topKey = null
    let topCount = 0
    for (const [key, count] of Object.entries(counts)) {
      if (count > topCount) {
        topCount = count
        topKey = key
      }
    }
    return topKey
  }

  async findContractorHistory(nip) {
    if (this.historyStore instanceof Map) {
      return this.historyStore.get(nip) || []
    }

    if (typeof this.historyStore.findByNip === 'function') {
      return this.historyStore.findByNip(nip)
    }

    return []
  }

  async saveToHistory(invoice) {
    const nip = invoice.contractorNip || invoice.sellerNip
    if (!nip) {
      return
    }

    const record = {
      invoiceId: invoice.id,
      category: invoice.category,
      mpk: invoice.mpk,
      description: invoice.description,
      grossAmount: invoice.grossAmount,
      date: invoice.issueDate,
      savedAt: new Date().toISOString(),
    }

    if (this.historyStore instanceof Map) {
      const existing = this.historyStore.get(nip) || []
      existing.push(record)
      this.historyStore.set(nip, existing)
    } else if (typeof this.historyStore.save === 'function') {
      await this.historyStore.save(nip, record)
    }

    this.emit('history:saved', { nip, record })
  }

  addRule(rule) {
    this.rules.push(rule)
  }

  removeRule(name) {
    this.rules = this.rules.filter((r) => r.name !== name)
  }

  setAiConfig(config) {
    this.aiConfig = config
    this.aiEnabled = true
  }

  disableAi() {
    this.aiEnabled = false
  }
}

function createAutoDescribeEngine(options = {}) {
  return new AutoDescribeEngine(options)
}

const defaultRules = [
  {
    name: 'hosting-keywords',
    keywords: ['hosting', 'serwer', 'domena', 'ssl', 'cloud'],
    category: CATEGORIES.HOSTING,
    confidence: 85,
  },
  {
    name: 'marketing-keywords',
    keywords: ['reklama', 'marketing', 'google ads', 'facebook', 'kampania'],
    category: CATEGORIES.MARKETING,
    confidence: 85,
  },
  {
    name: 'fuel-keywords',
    keywords: ['paliwo', 'benzyna', 'diesel', 'tankowanie', 'stacja'],
    category: CATEGORIES.FUEL,
    confidence: 90,
  },
  {
    name: 'telecom-keywords',
    keywords: ['telefon', 'internet', 'abonament', 'mobile', 'gsm'],
    category: CATEGORIES.TELECOM,
    confidence: 85,
  },
  {
    name: 'software-keywords',
    keywords: ['licencja', 'oprogramowanie', 'software', 'subskrypcja', 'saas'],
    category: CATEGORIES.SOFTWARE,
    confidence: 85,
  },
]

module.exports = {
  AutoDescribeEngine,
  createAutoDescribeEngine,
  CATEGORIES,
  defaultRules,
}
