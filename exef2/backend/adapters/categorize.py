"""
EXEF Auto-Categorization Engine

Automatically categorizes invoices based on:
- Contractor history
- Keyword rules
- Amount patterns
"""
from typing import Optional
from datetime import datetime

# Expense categories for KPiR
CATEGORIES = {
    "towary": {"name": "Zakup towarów handlowych", "kpir_column": 10},
    "materialy": {"name": "Zakup materiałów", "kpir_column": 10},
    "transport": {"name": "Koszty transportu", "kpir_column": 11},
    "wynagrodzenia": {"name": "Wynagrodzenia", "kpir_column": 12},
    "zus": {"name": "Składki ZUS", "kpir_column": 12},
    "paliwo": {"name": "Paliwo", "kpir_column": 13, "tags": ["auto"]},
    "auto_eksploatacja": {"name": "Eksploatacja samochodu", "kpir_column": 13, "tags": ["auto"]},
    "auto_ubezpieczenie": {"name": "Ubezpieczenie samochodu", "kpir_column": 13, "tags": ["auto"]},
    "auto_leasing": {"name": "Leasing samochodu", "kpir_column": 13, "tags": ["auto"]},
    "hosting": {"name": "Hosting i domeny", "kpir_column": 13, "tags": ["it"]},
    "oprogramowanie": {"name": "Oprogramowanie", "kpir_column": 13, "tags": ["it"]},
    "sprzet_it": {"name": "Sprzęt IT", "kpir_column": 13, "tags": ["it"]},
    "marketing": {"name": "Marketing i reklama", "kpir_column": 13},
    "biuro": {"name": "Materiały biurowe", "kpir_column": 13},
    "telefon": {"name": "Telefon i internet", "kpir_column": 13},
    "ksiegowosc": {"name": "Usługi księgowe", "kpir_column": 13},
    "uslugi": {"name": "Usługi obce", "kpir_column": 13},
    "szkolenia": {"name": "Szkolenia", "kpir_column": 13},
    "podroze": {"name": "Podróże służbowe", "kpir_column": 13},
    "reprezentacja": {"name": "Reprezentacja", "kpir_column": 13},
    "inne": {"name": "Inne koszty", "kpir_column": 13},
    "br_wynagrodzenia": {"name": "B+R: Wynagrodzenia", "kpir_column": 14, "tags": ["br"]},
    "br_materialy": {"name": "B+R: Materiały", "kpir_column": 14, "tags": ["br"]},
    "br_uslugi": {"name": "B+R: Usługi", "kpir_column": 14, "tags": ["br"]},
    "przychod_sprzedaz": {"name": "Przychód ze sprzedaży", "kpir_column": 7},
    "przychod_pozostaly": {"name": "Pozostałe przychody", "kpir_column": 8},
}

# Default categorization rules
DEFAULT_RULES = [
    {
        "name": "hosting-keywords",
        "keywords": ["hosting", "serwer", "domena", "ssl", "cloud", "aws", "azure", "gcp"],
        "category": "hosting",
        "confidence": 85,
    },
    {
        "name": "marketing-keywords",
        "keywords": ["reklama", "marketing", "google ads", "facebook", "kampania", "linkedin"],
        "category": "marketing",
        "confidence": 85,
    },
    {
        "name": "fuel-keywords",
        "keywords": ["paliwo", "benzyna", "diesel", "tankowanie", "stacja", "orlen", "bp", "shell"],
        "category": "paliwo",
        "confidence": 90,
    },
    {
        "name": "telecom-keywords",
        "keywords": ["telefon", "internet", "abonament", "mobile", "gsm", "orange", "play", "t-mobile", "plus"],
        "category": "telefon",
        "confidence": 85,
    },
    {
        "name": "software-keywords",
        "keywords": ["licencja", "oprogramowanie", "software", "subskrypcja", "saas", "microsoft", "adobe", "jetbrains"],
        "category": "oprogramowanie",
        "confidence": 85,
    },
    {
        "name": "accounting-keywords",
        "keywords": ["księgowość", "księgowe", "biuro rachunkowe", "rachunkowość", "fakturowanie"],
        "category": "ksiegowosc",
        "confidence": 90,
    },
    {
        "name": "office-keywords",
        "keywords": ["biuro", "papier", "materiały biurowe", "artykuły biurowe", "toner", "drukarka"],
        "category": "biuro",
        "confidence": 80,
    },
    {
        "name": "transport-keywords",
        "keywords": ["transport", "kurier", "przesyłka", "dhl", "ups", "fedex", "inpost", "poczta"],
        "category": "transport",
        "confidence": 85,
    },
    {
        "name": "car-insurance-keywords",
        "keywords": ["oc", "ac", "ubezpieczenie samochodu", "polisa", "pzu", "warta", "allianz"],
        "category": "auto_ubezpieczenie",
        "confidence": 85,
    },
    {
        "name": "car-leasing-keywords",
        "keywords": ["leasing", "rata leasingowa", "leasingodawca"],
        "category": "auto_leasing",
        "confidence": 90,
    },
]


class Suggestion:
    """Categorization suggestion"""
    def __init__(self, category: str, confidence: int, source: str, 
                 description: Optional[str] = None, mpk: Optional[str] = None):
        self.category = category
        self.confidence = confidence
        self.source = source
        self.description = description
        self.mpk = mpk
    
    def to_dict(self) -> dict:
        return {
            "category": self.category,
            "category_name": CATEGORIES.get(self.category, {}).get("name", self.category),
            "confidence": self.confidence,
            "source": self.source,
            "description": self.description,
            "mpk": self.mpk,
            "kpir_column": CATEGORIES.get(self.category, {}).get("kpir_column"),
            "tags": CATEGORIES.get(self.category, {}).get("tags", []),
        }


class AutoCategorizer:
    """Auto-categorization engine"""
    
    def __init__(self, rules: list[dict] = None, history_store: dict = None):
        self.rules = rules or DEFAULT_RULES
        self.history_store = history_store or {}  # nip -> list of past categorizations
    
    def suggest(self, document: dict) -> dict:
        """Generate categorization suggestion for document"""
        suggestions = []
        
        # 1. Check history by contractor NIP
        history_suggestion = self._suggest_from_history(document)
        if history_suggestion:
            suggestions.append(history_suggestion)
        
        # 2. Apply keyword rules
        rule_suggestion = self._suggest_from_rules(document)
        if rule_suggestion:
            suggestions.append(rule_suggestion)
        
        # 3. Pick best suggestion
        if not suggestions:
            return Suggestion(
                category="inne",
                confidence=0,
                source="default",
                description=None
            ).to_dict()
        
        # Sort by confidence, pick highest
        suggestions.sort(key=lambda s: s.confidence, reverse=True)
        return suggestions[0].to_dict()
    
    def _suggest_from_history(self, document: dict) -> Optional[Suggestion]:
        """Suggest based on contractor history"""
        nip = document.get("contractor_nip") or document.get("contractorNip")
        if not nip:
            return None
        
        history = self.history_store.get(nip, [])
        if not history:
            return None
        
        # Count categories from history
        category_counts = {}
        for record in history:
            cat = record.get("category")
            if cat:
                category_counts[cat] = category_counts.get(cat, 0) + 1
        
        if not category_counts:
            return None
        
        # Get most common category
        top_category = max(category_counts.keys(), key=lambda k: category_counts[k])
        count = category_counts[top_category]
        total = len(history)
        confidence = int((count / total) * 100)
        
        return Suggestion(
            category=top_category,
            confidence=confidence,
            source="history",
            description=f"Na podstawie {count} z {total} poprzednich faktur"
        )
    
    def _suggest_from_rules(self, document: dict) -> Optional[Suggestion]:
        """Suggest based on keyword rules"""
        # Build searchable text
        text_parts = [
            document.get("number", ""),
            document.get("contractor", ""),
            document.get("contractorName", ""),
            document.get("description", ""),
            document.get("email_subject", ""),
        ]
        text = " ".join(str(p) for p in text_parts if p).lower()
        
        for rule in self.rules:
            keywords = rule.get("keywords", [])
            if any(kw.lower() in text for kw in keywords):
                return Suggestion(
                    category=rule["category"],
                    confidence=rule.get("confidence", 80),
                    source="rule",
                    description=f"Reguła: {rule['name']}"
                )
        
        return None
    
    def save_to_history(self, nip: str, category: str, document_id: str):
        """Save categorization to history for future suggestions"""
        if not nip:
            return
        
        if nip not in self.history_store:
            self.history_store[nip] = []
        
        self.history_store[nip].append({
            "category": category,
            "document_id": document_id,
            "saved_at": datetime.utcnow().isoformat()
        })
    
    def add_rule(self, rule: dict):
        """Add custom categorization rule"""
        self.rules.append(rule)
    
    def remove_rule(self, name: str):
        """Remove rule by name"""
        self.rules = [r for r in self.rules if r.get("name") != name]
    
    def get_categories(self) -> dict:
        """Get all available categories"""
        return CATEGORIES


# Global categorizer instance
_categorizer: Optional[AutoCategorizer] = None


def get_categorizer() -> AutoCategorizer:
    """Get or create global categorizer"""
    global _categorizer
    if _categorizer is None:
        _categorizer = AutoCategorizer()
    return _categorizer


def suggest_category(document: dict) -> dict:
    """Suggest category for document"""
    return get_categorizer().suggest(document)


def save_categorization(nip: str, category: str, document_id: str):
    """Save categorization to history"""
    get_categorizer().save_to_history(nip, category, document_id)
