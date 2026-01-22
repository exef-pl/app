const crypto = require('node:crypto')

const VAT_RATES = {
  VAT_23: 23,
  VAT_8: 8,
  VAT_5: 5,
  VAT_0: 0,
  ZW: 'zw',
  NP: 'np',
}

class EntityBuilder {
  constructor() {
    this.entity = {
      name: '',
      nip: null,
      address: {},
      email: null,
      phone: null,
    }
  }

  withName(name) {
    this.entity.name = name
    return this
  }

  withNip(nip) {
    this.entity.nip = nip.replace(/\D/g, '')
    return this
  }

  withAddress(street, houseNumber, city, postalCode, apartmentNumber = null, country = 'PL') {
    this.entity.address = {
      street,
      houseNumber,
      apartmentNumber,
      city,
      postalCode,
      country,
    }
    return this
  }

  withEmail(email) {
    this.entity.email = email
    return this
  }

  withPhone(phone) {
    this.entity.phone = phone
    return this
  }

  build() {
    return { ...this.entity }
  }

  static create() {
    return new EntityBuilder()
  }
}

class InvoiceLineBuilder {
  constructor() {
    this.line = {
      lineNumber: 1,
      productName: '',
      productCode: null,
      quantity: 1,
      unit: 'szt.',
      unitPrice: 0,
      netAmount: 0,
      vatRate: VAT_RATES.VAT_23,
      vatAmount: 0,
      grossAmount: 0,
      discount: 0,
    }
  }

  withLineNumber(num) {
    this.line.lineNumber = num
    return this
  }

  withProduct(name, code = null) {
    this.line.productName = name
    this.line.productCode = code
    return this
  }

  withQuantity(quantity, unit = 'szt.') {
    this.line.quantity = quantity
    this.line.unit = unit
    return this
  }

  withUnitPrice(amount) {
    this.line.unitPrice = amount
    return this
  }

  withNetAmount(amount) {
    this.line.netAmount = amount
    return this
  }

  withVatRate(rate) {
    this.line.vatRate = rate
    return this
  }

  withDiscount(discount) {
    this.line.discount = discount
    return this
  }

  calculateAmounts() {
    const net = this.line.unitPrice * this.line.quantity * (1 - this.line.discount / 100)
    this.line.netAmount = Math.round(net * 100) / 100

    if (typeof this.line.vatRate === 'number') {
      this.line.vatAmount = Math.round(this.line.netAmount * this.line.vatRate) / 100
    } else {
      this.line.vatAmount = 0
    }

    this.line.grossAmount = Math.round((this.line.netAmount + this.line.vatAmount) * 100) / 100
    return this
  }

  build() {
    return { ...this.line }
  }

  static create() {
    return new InvoiceLineBuilder()
  }

  static simple(name, quantity, unitPrice, vatRate = VAT_RATES.VAT_23) {
    return new InvoiceLineBuilder()
      .withProduct(name)
      .withQuantity(quantity)
      .withUnitPrice(unitPrice)
      .withVatRate(vatRate)
      .calculateAmounts()
      .build()
  }
}

class InvoiceBuilder {
  constructor() {
    this.invoice = {
      id: crypto.randomUUID(),
      invoiceNumber: '',
      invoiceType: 'VAT',
      issueDate: new Date().toISOString().split('T')[0],
      saleDate: null,
      dueDate: null,
      currency: 'PLN',
      paymentMethod: 'przelew',
      seller: null,
      buyer: null,
      lines: [],
      totals: {
        netAmount: 0,
        vatAmount: 0,
        grossAmount: 0,
      },
      notes: null,
      bankAccount: null,
    }
  }

  withInvoiceNumber(number) {
    this.invoice.invoiceNumber = number
    return this
  }

  withInvoiceType(type) {
    this.invoice.invoiceType = type
    return this
  }

  withIssueDate(date) {
    this.invoice.issueDate = date
    return this
  }

  withSaleDate(date) {
    this.invoice.saleDate = date
    return this
  }

  withDueDate(date) {
    this.invoice.dueDate = date
    return this
  }

  withCurrency(currency) {
    this.invoice.currency = currency
    return this
  }

  withPaymentMethod(method) {
    this.invoice.paymentMethod = method
    return this
  }

  withSeller(seller) {
    this.invoice.seller = seller
    return this
  }

  withBuyer(buyer) {
    this.invoice.buyer = buyer
    return this
  }

  withBankAccount(account) {
    this.invoice.bankAccount = account
    return this
  }

  withNotes(notes) {
    this.invoice.notes = notes
    return this
  }

  addLine(line) {
    this.invoice.lines.push(line)
    return this
  }

  addLines(lines) {
    this.invoice.lines.push(...lines)
    return this
  }

  calculateTotals() {
    let netAmount = 0
    let vatAmount = 0
    let grossAmount = 0

    for (const line of this.invoice.lines) {
      netAmount += line.netAmount || 0
      vatAmount += line.vatAmount || 0
      grossAmount += line.grossAmount || 0
    }

    this.invoice.totals = {
      netAmount: Math.round(netAmount * 100) / 100,
      vatAmount: Math.round(vatAmount * 100) / 100,
      grossAmount: Math.round(grossAmount * 100) / 100,
    }

    return this
  }

  build() {
    return { ...this.invoice }
  }

  static create() {
    return new InvoiceBuilder()
  }

  static vatInvoice(invoiceNumber, issueDate, seller, buyer) {
    return new InvoiceBuilder()
      .withInvoiceNumber(invoiceNumber)
      .withInvoiceType('VAT')
      .withIssueDate(issueDate)
      .withSaleDate(issueDate)
      .withSeller(seller)
      .withBuyer(buyer)
  }
}

function generateInvoiceNumber(prefix = 'FV', date = new Date()) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const seq = String(Math.floor(Math.random() * 1000)).padStart(3, '0')
  return `${prefix}/${year}/${month}/${seq}`
}

module.exports = {
  EntityBuilder,
  InvoiceLineBuilder,
  InvoiceBuilder,
  generateInvoiceNumber,
  VAT_RATES,
}
