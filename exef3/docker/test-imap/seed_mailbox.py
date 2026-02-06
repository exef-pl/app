#!/usr/bin/env python3
"""Seed test IMAP mailbox with sample invoice emails."""
import mailbox
import os
import email
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from email.mime.base import MIMEBase
from email import encoders
from datetime import datetime

MAILDIR_PATH = "/home/testuser/Maildir"
TEST_DATA = "/app/test_data"


def create_email_with_csv():
    """Email with CSV invoice attachment."""
    msg = MIMEMultipart()
    msg["From"] = "faktury@ovh.pl"
    msg["To"] = "testuser@test.local"
    msg["Subject"] = "Faktury za styczeń 2026"
    msg["Date"] = "Mon, 20 Jan 2026 10:00:00 +0100"

    body = "W załączeniu przesyłamy faktury za styczeń 2026.\n\nPozdrawiamy,\nDział księgowości OVH"
    msg.attach(MIMEText(body, "plain", "utf-8"))

    csv_content = open(os.path.join(TEST_DATA, "faktury_styczen.csv"), "rb").read()
    part = MIMEBase("text", "csv")
    part.set_payload(csv_content)
    encoders.encode_base64(part)
    part.add_header("Content-Disposition", "attachment", filename="faktury_styczen_2026.csv")
    msg.attach(part)

    return msg


def create_email_with_xml():
    """Email with XML KSeF-style invoice attachment."""
    msg = MIMEMultipart()
    msg["From"] = "ksef-powiadomienia@mf.gov.pl"
    msg["To"] = "testuser@test.local"
    msg["Subject"] = "KSeF: Nowa faktura FV/001/01/2026"
    msg["Date"] = "Tue, 21 Jan 2026 14:30:00 +0100"

    body = "Otrzymałeś nową fakturę w systemie KSeF.\nNumer referencyjny: KSEF-2026-001-0001"
    msg.attach(MIMEText(body, "plain", "utf-8"))

    xml_content = open(os.path.join(TEST_DATA, "faktura_ksef.xml"), "rb").read()
    part = MIMEBase("application", "xml")
    part.set_payload(xml_content)
    encoders.encode_base64(part)
    part.add_header("Content-Disposition", "attachment", filename="faktura_FV_001_01_2026.xml")
    msg.attach(part)

    return msg


def create_email_with_pdf():
    """Email with PDF invoice attachment (data extracted from filename)."""
    msg = MIMEMultipart()
    msg["From"] = "rozliczenia@allegro.pl"
    msg["To"] = "testuser@test.local"
    msg["Subject"] = "Faktura FV/042/01/2026 - Allegro.pl"
    msg["Date"] = "Wed, 22 Jan 2026 09:15:00 +0100"

    body = "Dzień dobry,\n\nW załączeniu faktura za usługi Allegro.\nKwota brutto: 1 230,00 PLN\nNIP: 5272525995\n\nPozdrawiamy"
    msg.attach(MIMEText(body, "plain", "utf-8"))

    # Create a minimal PDF-like file (for testing, just a text marker)
    pdf_content = b"%PDF-1.4 fake test invoice FV/042/01/2026 Allegro"
    part = MIMEBase("application", "pdf")
    part.set_payload(pdf_content)
    encoders.encode_base64(part)
    part.add_header("Content-Disposition", "attachment", filename="FV-042-01-2026-Allegro.pdf")
    msg.attach(part)

    return msg


def create_email_body_only():
    """Email with invoice data only in body text (no attachments)."""
    msg = MIMEText(
        "Dzień dobry,\n\n"
        "Informujemy o wystawionej fakturze:\n"
        "Faktura: FV/099/01/2026\n"
        "Kontrahent: Shell Polska Sp. z o.o.\n"
        "NIP: 5270008597\n"
        "Kwota brutto: 456,78 PLN\n"
        "Data wystawienia: 2026-01-15\n\n"
        "Proszę o terminową płatność.\n"
        "Pozdrawiamy",
        "plain", "utf-8"
    )
    msg["From"] = "faktury@shell.pl"
    msg["To"] = "testuser@test.local"
    msg["Subject"] = "Faktura FV/099/01/2026 - Shell Polska"
    msg["Date"] = "Thu, 23 Jan 2026 16:45:00 +0100"

    return msg


def create_email_bank_statement():
    """Email with bank statement CSV attachment."""
    msg = MIMEMultipart()
    msg["From"] = "powiadomienia@ing.pl"
    msg["To"] = "testuser@test.local"
    msg["Subject"] = "Wyciąg bankowy - ING - Styczeń 2026"
    msg["Date"] = "Fri, 31 Jan 2026 08:00:00 +0100"

    body = "W załączeniu wyciąg z rachunku za styczeń 2026."
    msg.attach(MIMEText(body, "plain", "utf-8"))

    csv_content = open(os.path.join(TEST_DATA, "wyciag_ing.csv"), "rb").read()
    part = MIMEBase("text", "csv")
    part.set_payload(csv_content)
    encoders.encode_base64(part)
    part.add_header("Content-Disposition", "attachment", filename="wyciag_ING_202601.csv")
    msg.attach(part)

    return msg


def main():
    # Create Maildir structure
    md = mailbox.Maildir(MAILDIR_PATH, create=True)

    messages = [
        create_email_with_csv(),
        create_email_with_xml(),
        create_email_with_pdf(),
        create_email_body_only(),
        create_email_bank_statement(),
    ]

    for msg in messages:
        md.add(msg)

    md.close()

    # Fix ownership
    os.system(f"chown -R testuser:testuser {MAILDIR_PATH}")
    print(f"Seeded {len(messages)} test emails into {MAILDIR_PATH}")


if __name__ == "__main__":
    main()
