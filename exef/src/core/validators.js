function sanitizeNip(nip) {
  return String(nip || '').replace(/\D/g, '')
}

function isValidNip(nip) {
  const digits = sanitizeNip(nip)
  if (digits.length !== 10) {
    return false
  }

  const weights = [6, 5, 7, 2, 3, 4, 5, 6, 7]
  let sum = 0

  for (let i = 0; i < 9; i++) {
    sum += parseInt(digits[i], 10) * weights[i]
  }

  const checksum = sum % 11
  return checksum === parseInt(digits[9], 10)
}

function isValidIban(iban) {
  const cleaned = String(iban || '').replace(/\s/g, '').toUpperCase()

  if (!/^[A-Z]{2}\d{2}[A-Z0-9]{1,30}$/.test(cleaned)) {
    return false
  }

  const rearranged = cleaned.slice(4) + cleaned.slice(0, 4)

  const numericIban = rearranged.replace(/[A-Z]/g, (char) => {
    return (char.charCodeAt(0) - 55).toString()
  })

  let remainder = numericIban
  while (remainder.length > 2) {
    const block = remainder.slice(0, 9)
    remainder = (parseInt(block, 10) % 97).toString() + remainder.slice(block.length)
  }

  return parseInt(remainder, 10) % 97 === 1
}

function isValidPolishIban(iban) {
  const cleaned = sanitizeNip(iban)
  if (cleaned.length !== 26) {
    return false
  }
  return isValidIban('PL' + cleaned)
}

function formatIban(iban) {
  const cleaned = String(iban || '').replace(/\s/g, '').toUpperCase()
  return cleaned.replace(/(.{4})/g, '$1 ').trim()
}

function isValidEmail(email) {
  const pattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
  return pattern.test(String(email || ''))
}

function isValidKsefNumber(ksefNumber) {
  const pattern = /^\d{10}-\d{8}-[A-Z0-9]{12}-[A-Z0-9]{2}$/
  return pattern.test(String(ksefNumber || ''))
}

function isValidInvoiceNumber(invoiceNumber) {
  const value = String(invoiceNumber || '').trim()
  return value.length >= 1 && value.length <= 256
}

function isValidAmount(amount) {
  const num = parseFloat(amount)
  return !isNaN(num) && isFinite(num) && num >= 0
}

function isValidDate(dateStr) {
  if (!dateStr) return false
  const date = new Date(dateStr)
  return !isNaN(date.getTime())
}

function isValidVatRate(rate) {
  const validRates = [23, 22, 8, 7, 5, 4, 3, 0, 'zw', 'np', 'oo']
  return validRates.includes(rate)
}

function round2(n) {
  return Math.round(n * 100) / 100
}

function formatPLN(n) {
  return new Intl.NumberFormat('pl-PL', {
    style: 'currency',
    currency: 'PLN',
  }).format(n)
}

function formatAmount(n, currency = 'PLN') {
  return new Intl.NumberFormat('pl-PL', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(n) + ' ' + currency
}

function parseAmount(input) {
  if (typeof input === 'number') return input
  const cleaned = String(input || '')
    .replace(/\s/g, '')
    .replace(/,/g, '.')
    .replace(/[^\d.-]/g, '')
  const num = parseFloat(cleaned)
  return isNaN(num) ? undefined : num
}

function calcVat(netAmount, vatRate) {
  if (typeof vatRate !== 'number') {
    return 0
  }
  return round2(netAmount * vatRate / 100)
}

function calcGross(netAmount, vatRate) {
  return round2(netAmount + calcVat(netAmount, vatRate))
}

function calcNet(grossAmount, vatRate) {
  if (typeof vatRate !== 'number' || vatRate === 0) {
    return grossAmount
  }
  return round2(grossAmount / (1 + vatRate / 100))
}

module.exports = {
  sanitizeNip,
  isValidNip,
  isValidIban,
  isValidPolishIban,
  formatIban,
  isValidEmail,
  isValidKsefNumber,
  isValidInvoiceNumber,
  isValidAmount,
  isValidDate,
  isValidVatRate,
  round2,
  formatPLN,
  formatAmount,
  parseAmount,
  calcVat,
  calcGross,
  calcNet,
}
