#!/usr/bin/env python3
"""
Generowanie przykładowych plików w formatach PDF, PNG, JPG
"""

from pathlib import Path
from reportlab.lib.pagesizes import A4
from reportlab.pdfgen import canvas
from reportlab.lib.styles import getSampleStyleSheet
from reportlab.platypus import Paragraph, Spacer
from reportlab.lib.units import inch
from PIL import Image, ImageDraw, ImageFont
import os

def create_invoice_pdf(output_path):
    """Stwórz fakturę w formacie PDF"""
    c = canvas.Canvas(str(output_path), pagesize=A4)
    width, height = A4
    
    # Nagłówek
    c.setFont("Helvetica-Bold", 20)
    c.drawString(200, height - 100, "FAKTURA VAT")
    
    c.setFont("Helvetica", 12)
    c.drawString(200, height - 130, f"Numer: FV/2025/00142")
    c.drawString(200, height - 150, f"Data: 2025-01-15")
    c.drawString(200, height - 170, f"Termin płatności: 2025-01-22")
    
    # Sprzedawca
    c.setFont("Helvetica-Bold", 12)
    c.drawString(50, height - 250, "SPRZEDAWCA:")
    c.setFont("Helvetica", 10)
    c.drawString(50, height - 270, "Firma ABC Sp. z o.o.")
    c.drawString(50, height - 285, "ul. Przykładowa 1")
    c.drawString(50, height - 300, "00-123 Warszawa")
    c.drawString(50, height - 315, "NIP: 521-301-72-28")
    
    # Nabywca
    c.setFont("Helvetica-Bold", 12)
    c.drawString(350, height - 250, "NABYWCA:")
    c.setFont("Helvetica", 10)
    c.drawString(350, height - 270, "Firma XYZ")
    c.drawString(350, height - 285, "ul. Testowa 2")
    c.drawString(350, height - 300, "00-456 Kraków")
    c.drawString(350, height - 315, "NIP: 123-456-78-90")
    
    # Tabela z usługami
    c.setFont("Helvetica-Bold", 12)
    c.drawString(50, height - 400, "SPECYFIKACJA USŁUG:")
    
    c.line(50, height - 420, 550, height - 420)
    c.drawString(50, height - 440, "Lp.")
    c.drawString(100, height - 440, "Nazwa usługi")
    c.drawString(400, height - 440, "Cena")
    c.drawString(480, height - 440, "Wartość")
    c.line(50, height - 450, 550, height - 450)
    
    c.setFont("Helvetica", 10)
    c.drawString(50, height - 480, "1.")
    c.drawString(100, height - 480, "Usługa programistyczna")
    c.drawString(400, height - 480, "1230,50")
    c.drawString(480, height - 480, "1230,50")
    
    c.line(50, height - 500, 550, height - 500)
    
    # Podsumowanie
    c.setFont("Helvetica-Bold", 12)
    c.drawString(400, height - 550, "RAZEM BRUTTO:")
    c.drawString(500, height - 550, "1230,50")
    
    # Formy płatności
    c.setFont("Helvetica", 10)
    c.drawString(50, height - 650, "Forma płatności: przelew")
    c.drawString(50, height - 670, "Rachunek bankowy: PL 12 3456 7890 1234 5678 9012 3456")
    
    c.save()

def create_receipt_pdf(output_path):
    """Stwórz paragon w formacie PDF"""
    c = canvas.Canvas(str(output_path), pagesize=A4)
    width, height = A4
    
    # Nagłówek
    c.setFont("Helvetica-Bold", 16)
    c.drawString(250, height - 80, "PARAGON FISKALNY")
    
    c.setFont("Helvetica", 12)
    c.drawString(230, height - 110, "NR 001/2025/000123")
    c.drawString(210, height - 130, "2025-01-15 14:30:00")
    
    # Sklep
    c.setFont("Helvetica", 10)
    c.drawString(200, height - 180, "SKLEP ABC")
    c.drawString(180, height - 200, "ul. Handlowa 5, 00-789 Łódź")
    c.drawString(200, height - 220, "NIP: 521-301-72-28")
    c.drawString(220, height - 240, "Kasa: 001")
    
    # Produkty
    c.line(50, height - 280, 550, height - 280)
    c.drawString(50, height - 300, "Chleb                     3,50 PLN A")
    c.drawString(50, height - 320, "Mleko                     4,20 PLN A")
    c.drawString(50, height - 340, "Ser                       8,90 PLN A")
    c.drawString(50, height - 360, "Jajka                     6,40 PLN A")
    c.drawString(50, height - 380, "Masło                     7,80 PLN A")
    c.line(50, height - 400, 550, height - 400)
    
    # Podsumowanie
    c.setFont("Helvetica-Bold", 12)
    c.drawString(400, height - 450, "SUMA:")
    c.drawString(480, height - 450, "37,88")
    
    c.setFont("Helvetica", 10)
    c.drawString(400, height - 480, "GOTÓWKA:")
    c.drawString(480, height - 480, "50,00")
    c.drawString(400, height - 500, "RESZTA:")
    c.drawString(480, height - 500, "12,12")
    
    # Stopka
    c.setFont("Helvetica", 8)
    c.drawString(200, height - 600, "PARAGON FISKALNY")
    c.drawString(180, height - 620, "NIP: 521-301-72-28")
    c.drawString(200, height - 640, "Nr kasy: 001")
    c.drawString(200, height - 660, "Dziękujemy za zakupy!")
    
    c.save()

def create_contract_pdf(output_path):
    """Stwórz umowę w formacie PDF"""
    c = canvas.Canvas(str(output_path), pagesize=A4)
    width, height = A4
    
    # Nagłówek
    c.setFont("Helvetica-Bold", 18)
    c.drawString(200, height - 80, "UMOWA ZLECENIE")
    
    c.setFont("Helvetica", 12)
    c.drawString(200, height - 110, "Nr 001/2025")
    c.drawString(180, height - 130, "zawarta w dniu 15.01.2025 w Warszawie")
    
    # Strony
    c.setFont("Helvetica-Bold", 12)
    c.drawString(50, height - 200, "STRONY UMOWY:")
    
    c.setFont("Helvetica", 10)
    c.drawString(50, height - 220, "ZLECENIODAWCA:")
    c.drawString(50, height - 240, "Firma ABC Sp. z o.o.")
    c.drawString(50, height - 260, "ul. Przykładowa 1, 00-123 Warszawa")
    c.drawString(50, height - 280, "NIP: 521-301-72-28")
    
    c.drawString(300, height - 220, "WYKONAWCA:")
    c.drawString(300, height - 240, "Jan Kowalski")
    c.drawString(300, height - 260, "ul. Robotnicza 15, 12-345 Radom")
    c.drawString(300, height - 280, "PESEL: 12345678901")
    
    # Przedmiot umowy
    c.setFont("Helvetica-Bold", 12)
    c.drawString(50, height - 350, "§ 1. PRZEDMIOT UMOWY")
    
    c.setFont("Helvetica", 10)
    text = "Wykonawca zobowiązuje się do wykonania usług programistycznych na rzecz Zleceniodawcy."
    c.drawString(50, height - 380, text[:80])
    c.drawString(50, height - 400, text[80:])
    
    # Wynagrodzenie
    c.setFont("Helvetica-Bold", 12)
    c.drawString(50, height - 450, "§ 2. WYNAGRODZENIE")
    
    c.setFont("Helvetica", 10)
    c.drawString(50, height - 480, "Zleceniodawca zobowiązuje się zapłacić Wykonawcy wynagrodzenie w wysokości:")
    c.drawString(50, height - 500, "5000 zł brutto za wykonanie przedmiotu umowy.")
    
    # Termin
    c.setFont("Helvetica-Bold", 12)
    c.drawString(50, height - 550, "§ 3. TERMIN WYKONANIA")
    
    c.setFont("Helvetica", 10)
    c.drawString(50, height - 580, "Umowa zostanie wykonana w terminie do 31.03.2025.")
    
    # Podpisy
    c.setFont("Helvetica", 10)
    c.drawString(50, height - 650, "ZLECENIODAWCA:")
    c.line(50, height - 670, 200, height - 670)
    c.drawString(50, height - 690, "Jan Nowak")
    
    c.drawString(350, height - 650, "WYKONAWCA:")
    c.line(350, height - 670, 500, height - 670)
    c.drawString(350, height - 690, "Jan Kowalski")
    
    c.save()

def create_text_image(text, output_path, width=800, height=600):
    """Stwórz obraz z tekstem"""
    img = Image.new('RGB', (width, height), color='white')
    draw = ImageDraw.Draw(img)
    
    try:
        font = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf", 16)
    except:
        font = ImageFont.load_default()
    
    # Podziel tekst na linie
    lines = text.split('\n')
    y_position = 50
    
    for line in lines:
        if line.strip():
            draw.text((50, y_position), line, fill='black', font=font)
        y_position += 30
    
    img.save(str(output_path))

def create_invoice_images(output_dir):
    """Stwórz obrazy faktury"""
    invoice_text = """FAKTURA VAT
Numer: FV/2025/00142
Data: 2025-01-15

SPRZEDAWCA:
Firma ABC Sp. z o.o.
ul. Przykładowa 1
00-123 Warszawa
NIP: 521-301-72-28

NABYWCA:
Firma XYZ
ul. Testowa 2
00-456 Kraków
NIP: 123-456-78-90

SPECYFIKACJA:
1. Usługa programistyczna - 1230,50 PLN

RAZEM BRUTTO: 1230,50 PLN
Forma płatności: przelew
Konto: PL 12 3456 7890 1234 5678 9012 3456"""
    
    create_text_image(invoice_text, output_dir / "faktura_full.png")
    create_text_image(invoice_text, output_dir / "faktura_full.jpg")

def create_receipt_images(output_dir):
    """Stwórz obrazy paragonu"""
    receipt_text = """PARAGON FISKALNY
NR 001/2025/000123
2025-01-15 14:30:00

SKLEP ABC
ul. Handlowa 5, 00-789 Łódź
NIP: 521-301-72-28

Chleb                     3,50 PLN A
Mleko                     4,20 PLN A
Ser                       8,90 PLN A
Jajka                     6,40 PLN A
Masło                     7,80 PLN A

SUMA:                   37,88 PLN
GOTÓWKA:                50,00 PLN
RESZTA:                 12,12 PLN

Dziękujemy za zakupy!"""
    
    create_text_image(receipt_text, output_dir / "paragon_full.png")
    create_text_image(receipt_text, output_dir / "paragon_full.jpg")

def create_contract_images(output_dir):
    """Stwórz obrazy umowy"""
    contract_text = """UMOWA ZLECENIE
Nr 001/2025
zawarta w dniu 15.01.2025 w Warszawie

STRONY:
ZLECENIODAWCA:
Firma ABC Sp. z o.o.
ul. Przykładowa 1, 00-123 Warszawa
NIP: 521-301-72-28

WYKONAWCA:
Jan Kowalski
ul. Robotnicza 15, 12-345 Radom
PESEL: 12345678901

§ 1. PRZEDMIOT UMOWY
Wykonawca zobowiązuje się do wykonania usług programistycznych
na rzecz Zleceniodawcy.

§ 2. WYNAGRODZENIE
5000 zł brutto za wykonanie przedmiotu umowy.

§ 3. TERMIN WYKONANIA
Umowa zostanie wykonana do 31.03.2025.

PODPISY:
ZLECENIODAWCA: _______________ Jan Nowak
WYKONAWCA:    _______________ Jan Kowalski"""
    
    create_text_image(contract_text, output_dir / "umowa_full.png")
    create_text_image(contract_text, output_dir / "umowa_full.jpg")

def main():
    print("=" * 60)
    print("GENEROWANIE PRZYKŁADOWYCH PLIKÓW PDF, PNG, JPG")
    print("=" * 60)
    
    samples_dir = Path("samples")
    
    # Foldery
    folders = {
        "invoices": "Faktury",
        "receipts": "Paragony",
        "contracts": "Umowy"
    }
    
    for folder, folder_name in folders.items():
        folder_path = samples_dir / folder
        print(f"\nGenerowanie plików dla {folder_name}...")
        
        # PDF
        if folder == "invoices":
            create_invoice_pdf(folder_path / "faktura_full.pdf")
        elif folder == "receipts":
            create_receipt_pdf(folder_path / "paragon_full.pdf")
        elif folder == "contracts":
            create_contract_pdf(folder_path / "umowa_full.pdf")
        
        # PNG i JPG
        if folder == "invoices":
            create_invoice_images(folder_path)
        elif folder == "receipts":
            create_receipt_images(folder_path)
        elif folder == "contracts":
            create_contract_images(folder_path)
        
        print(f"  ✅ Utworzono pliki w {folder}/")
    
    print(f"\n{'=' * 60}")
    print("GENEROWANIE ZAKOŃCZONE")
    print(f"{'=' * 60}")
    
    # Pokaż statystyki
    print(f"\nStatystyki plików:")
    total_files = 0
    total_size = 0
    
    for folder in folders.keys():
        folder_path = samples_dir / folder
        files = list(folder_path.glob("*"))
        files = [f for f in files if f.is_file()]
        
        folder_size = sum(f.stat().st_size for f in files)
        print(f"  {folder}/: {len(files)} plików, {folder_size}B")
        total_files += len(files)
        total_size += folder_size
    
    print(f"\nRazem: {total_files} plików, {total_size}B")

if __name__ == "__main__":
    main()
