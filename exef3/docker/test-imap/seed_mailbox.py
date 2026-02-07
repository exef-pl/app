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


def create_email_march_csv():
    """Email with CSV invoice attachment for March 2026."""
    msg = MIMEMultipart()
    msg["From"] = "faktury@ovh.pl"
    msg["To"] = "testuser@test.local"
    msg["Subject"] = "Faktury za marzec 2026"
    msg["Date"] = "Mon, 20 Mar 2026 10:00:00 +0100"

    body = "W załączeniu przesyłamy faktury za marzec 2026.\n\nPozdrawiamy,\nDział księgowości OVH"
    msg.attach(MIMEText(body, "plain", "utf-8"))

    csv_data = (
        "numer;kontrahent;nip;data;netto;vat;brutto;waluta\n"
        "FV/201/03/2026;OVH Sp. z o.o.;5213003700;2026-03-05;1219.51;280.49;1500.00;PLN\n"
        "FV/202/03/2026;Hetzner Online GmbH;;2026-03-08;2439.02;560.98;3000.00;PLN\n"
        "FV/203/03/2026;Comarch S.A.;6770065406;2026-03-12;813.01;186.99;1000.00;PLN\n"
        "FV/204/03/2026;IKEA Retail Sp. z o.o.;5262548458;2026-03-18;3252.03;747.97;4000.00;PLN\n"
        "FV/205/03/2026;Shell Polska Sp. z o.o.;5270008597;2026-03-22;1626.02;373.98;2000.00;PLN\n"
        "FV/206/03/2026;PGE Obrót S.A.;6110202860;2026-03-25;569.11;130.89;700.00;PLN\n"
        "FV/207/03/2026;Orange Polska S.A.;5260250995;2026-03-28;4065.04;934.96;5000.00;PLN\n"
        "FV/208/03/2026;MediaMarkt Sp. z o.o.;5213406938;2026-03-30;1463.41;336.59;1800.00;PLN\n"
    ).encode("utf-8")
    part = MIMEBase("text", "csv")
    part.set_payload(csv_data)
    encoders.encode_base64(part)
    part.add_header("Content-Disposition", "attachment", filename="faktury_marzec_2026.csv")
    msg.attach(part)

    return msg


def create_email_march_body():
    """Email with invoice data in body for March 2026."""
    msg = MIMEText(
        "Dzień dobry,\n\n"
        "Informujemy o wystawionej fakturze:\n"
        "Faktura: FV/301/03/2026\n"
        "Kontrahent: Allegro.pl Sp. z o.o.\n"
        "NIP: 5272525995\n"
        "Kwota brutto: 2 345,67 PLN\n"
        "Data wystawienia: 2026-03-15\n\n"
        "Proszę o terminową płatność.\n"
        "Pozdrawiamy",
        "plain", "utf-8"
    )
    msg["From"] = "faktury@allegro.pl"
    msg["To"] = "testuser@test.local"
    msg["Subject"] = "Faktura FV/301/03/2026 - Allegro.pl"
    msg["Date"] = "Sat, 15 Mar 2026 11:30:00 +0100"

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
        create_email_march_csv(),
        create_email_march_body(),
    ]

    for msg in messages:
        md.add(msg)

    md.close()

    # Fix ownership
    os.system(f"chown -R testuser:testuser {MAILDIR_PATH}")
    print(f"Seeded {len(messages)} test emails into {MAILDIR_PATH}")


if __name__ == "__main__":
    main()
