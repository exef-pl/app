#!/usr/bin/env python3
"""
Generowanie przykładowych dokumentów uniwersalnych - PDF z grafiką, zdjęcia, wektory
"""

from pathlib import Path
from reportlab.lib.pagesizes import A4
from reportlab.pdfgen import canvas
from reportlab.lib.colors import Color, black, blue, red, green
from reportlab.lib.utils import ImageReader
from PIL import Image, ImageDraw, ImageFont
import os
import hashlib

def create_pdf_with_graphics(output_path):
    """Stwórz PDF z różnymi typami grafiki"""
    c = canvas.Canvas(str(output_path), pagesize=A4)
    width, height = A4
    
    # Tekst
    c.setFont("Helvetica-Bold", 20)
    c.drawString(200, height - 80, "PDF z Grafiką i Wektorami")
    
    c.setFont("Helvetica", 12)
    c.drawString(50, height - 120, "Ten dokument zawiera:")
    c.drawString(50, height - 140, "• Tekst i czcionki")
    c.drawString(50, height - 160, "• Krzywe i linie wektorowe")
    c.drawString(50, height - 180, "• Kształty geometryczne")
    c.drawString(50, height - 200, "• Gradienty i kolory")
    
    # Krzywe wektorowe (Bezier curves)
    c.setStrokeColor(blue)
    c.setLineWidth(2)
    path = c.beginPath()
    path.moveTo(100, height - 300)
    path.curveTo(150, height - 250, 250, height - 350, 300, height - 300)
    c.drawPath(path, stroke=1)
    
    # Kształty geometryczne
    c.setStrokeColor(red)
    c.setFillColor(Color(0.8, 0.2, 0.2, 0.3))
    c.rect(350, height - 350, 100, 80, fill=1, stroke=1)
    
    c.setStrokeColor(green)
    c.setFillColor(Color(0.2, 0.8, 0.2, 0.3))
    c.circle(200, height - 400, 40, fill=1, stroke=1)
    
    # Linie i wzory
    c.setStrokeColor(black)
    c.setLineWidth(1)
    for i in range(5):
        y = height - 450 - i * 20
        c.line(50, y, 500, y)
    
    # Dodaj metadane
    c.setCreator("Universal Document ID Generator")
    c.setTitle("Test PDF z Grafiką")
    c.setSubject("Document with vectors and graphics")
    
    c.save()

def create_pdf_with_image(output_path):
    """Stwórz PDF ze zdjęciem"""
    # Najpierw stwórz obraz
    img = Image.new('RGB', (400, 300), color='white')
    draw = ImageDraw.Draw(img)
    
    # Rysuj prosty obraz
    try:
        font = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf", 20)
    except:
        font = ImageFont.load_default()
    
    # Tło z gradientem
    for y in range(300):
        color = (255 - y//2, 200 - y//3, 150 - y//4)
        draw.line([(0, y), (400, y)], fill=color)
    
    # Dodaj tekst
    draw.text((100, 100), "Zdjęcie Testowe", fill='white', font=font)
    draw.text((120, 150), "Universal ID Test", fill='white', font=font)
    
    # Dodaj kształty
    draw.rectangle([50, 200, 150, 250], fill='red', outline='darkred')
    draw.ellipse([250, 200, 350, 250], fill='blue', outline='darkblue')
    
    # Zapisz obraz tymczasowo
    temp_img_path = output_path.parent / "temp_image.png"
    img.save(temp_img_path)
    
    # Stwórz PDF z obrazem
    c = canvas.Canvas(str(output_path), pagesize=A4)
    width, height = A4
    
    c.setFont("Helvetica-Bold", 20)
    c.drawString(200, height - 80, "PDF ze Zdjęciem")
    
    c.setFont("Helvetica", 12)
    c.drawString(50, height - 120, "Dokument zawiera osadzone zdjęcie:")
    
    # Dodaj obraz do PDF
    try:
        img_reader = ImageReader(str(temp_img_path))
        c.drawImage(img_reader, 100, height - 400, width=400, height=300)
    except Exception as e:
        c.drawString(50, height - 200, f"Błąd ładowania obrazu: {e}")
    
    # Dodaj metadane
    c.setCreator("Universal Document ID Generator")
    c.setTitle("Test PDF ze Zdjęciem")
    c.setSubject("Document with embedded image")
    
    c.save()
    
    # Usuń tymczasowy obraz
    if temp_img_path.exists():
        temp_img_path.unlink()

def create_vector_graphics_pdf(output_path):
    """Stwórz PDF z samymi wektorami"""
    c = canvas.Canvas(str(output_path), pagesize=A4)
    width, height = A4
    
    # Tytuł
    c.setFont("Helvetica-Bold", 20)
    c.drawString(150, height - 80, "PDF z Samymi Wektorami")
    
    # Skomplikowane krzywe
    c.setStrokeColor(blue)
    c.setLineWidth(3)
    path = c.beginPath()
    path.moveTo(50, height - 200)
    for i in range(10):
        x = 50 + i * 50
        y = height - 200 + (i % 2) * 50
        if i == 0:
            path.moveTo(x, y)
        else:
            path.lineTo(x, y)
    c.drawPath(path, stroke=1)
    
    # Krzywe Bezier
    c.setStrokeColor(red)
    c.setLineWidth(2)
    path = c.beginPath()
    path.moveTo(100, height - 300)
    path.curveTo(200, height - 250, 300, height - 350, 400, height - 300)
    path.curveTo(450, height - 280, 480, height - 320, 500, height - 300)
    c.drawPath(path, stroke=1)
    
    # Wielokąty
    c.setStrokeColor(green)
    c.setFillColor(Color(0.2, 0.8, 0.2, 0.5))
    points = [(200, height - 400), (250, height - 450), (300, height - 400), (280, height - 380), (220, height - 380)]
    path = c.beginPath()
    path.moveTo(points[0][0], points[0][1])
    for point in points[1:]:
        path.lineTo(point[0], point[1])
    path.close()
    c.drawPath(path, fill=1, stroke=1)
    
    # Okręgi i elipsy
    c.setStrokeColor(Color(0.5, 0, 0.5))
    c.setFillColor(Color(0.5, 0, 0.5, 0.3))
    for i in range(3):
        x = 150 + i * 100
        y = height - 500
        radius = 20 + i * 10
        c.ellipse(x - radius, y - radius, x + radius, y + radius, fill=1, stroke=1)
    
    # Dodaj metadane
    c.setCreator("Universal Document ID Generator")
    c.setTitle("Test PDF Vector Graphics")
    c.setSubject("Document with vector graphics only")
    
    c.save()

def create_varied_images(output_dir):
    """Stwórz różne typy obrazów"""
    
    # Obraz 1: Zdjęcie z tekstem
    img1 = Image.new('RGB', (600, 400), color='white')
    draw1 = ImageDraw.Draw(img1)
    
    # Gradient tła
    for y in range(400):
        color = (255, 255 - y//2, 200 - y//3)
        draw1.line([(0, y), (600, y)], fill=color)
    
    try:
        font = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf", 24)
    except:
        font = ImageFont.load_default()
    
    draw1.text((200, 50), "Zdjęcie Testowe 1", fill='black', font=font)
    draw1.text((150, 100), "Universal Document ID", fill='darkblue', font=font)
    draw1.text((180, 150), "Image Processing Test", fill='darkgreen', font=font)
    
    # Kształty
    draw1.rectangle([100, 200, 200, 300], fill='red', outline='darkred', width=3)
    draw1.ellipse([400, 200, 500, 300], fill='blue', outline='darkblue', width=3)
    draw1.polygon([(300, 250), (350, 200), (400, 250), (350, 300)], fill='green', outline='darkgreen', width=2)
    
    img1.save(output_dir / "photo_test_1.png")
    img1.save(output_dir / "photo_test_1.jpg")
    
    # Obraz 2: Grafika wektorowa (symulowana)
    img2 = Image.new('RGB', (500, 500), color='white')
    draw2 = ImageDraw.Draw(img2)
    
    # Tło wzorzyste
    for x in range(0, 500, 20):
        for y in range(0, 500, 20):
            if (x + y) % 40 == 0:
                draw2.rectangle([x, y, x+20, y+20], fill='lightgray')
    
    # Skomplikowane wzory
    colors = ['red', 'blue', 'green', 'orange', 'purple']
    for i in range(5):
        color = colors[i]
        center_x, center_y = 250, 250
        radius = 30 + i * 40
        draw2.ellipse([center_x - radius, center_y - radius, center_x + radius, center_y + radius], 
                      outline=color, width=3)
    
    # Gwiazda
    star_points = []
    for i in range(10):
        angle = i * 36 * 3.14159 / 180
        if i % 2 == 0:
            r = 80
        else:
            r = 30
        x = 250 + r * cos(angle)
        y = 250 + r * sin(angle)
        star_points.append((x, y))
    
    draw2.polygon(star_points, fill='yellow', outline='orange', width=2)
    
    img2.save(output_dir / "vector_test_2.png")
    img2.save(output_dir / "vector_test_2.jpg")
    
    # Obraz 3: Czysto graficzny
    img3 = Image.new('RGB', (400, 600), color='white')
    draw3 = ImageDraw.Draw(img3)
    
    # Gradient pionowy
    for y in range(600):
        color = (y//3, 100, 255 - y//3)
        draw3.line([(0, y), (400, y)], fill=color)
    
    # Krzywe (symulowane)
    for i in range(5):
        points = []
        for j in range(20):
            x = j * 20
            y = 100 + i * 80 + sin(j * 0.5) * 30
            points.append((x, y))
        
        for k in range(len(points) - 1):
            draw3.line([points[k], points[k+1]], fill='white', width=3)
    
    img3.save(output_dir / "graphic_test_3.png")
    img3.save(output_dir / "graphic_test_3.jpg")

def create_mixed_document_pdf(output_path):
    """Stwórz PDF mieszanego typu"""
    c = canvas.Canvas(str(output_path), pagesize=A4)
    width, height = A4
    
    # Strona 1: Tekst i wektory
    c.setFont("Helvetica-Bold", 18)
    c.drawString(150, height - 80, "Dokument Mieszany - Strona 1")
    
    c.setFont("Helvetica", 12)
    c.drawString(50, height - 120, "Ta strona zawiera tekst i grafikę wektorową")
    
    # Wektory
    c.setStrokeColor(blue)
    c.setLineWidth(2)
    for i in range(5):
        c.circle(100 + i * 80, height - 250, 30, fill=0, stroke=1)
    
    c.showPage()
    
    # Strona 2: Tylko grafika
    c.setFont("Helvetica-Bold", 18)
    c.drawString(150, height - 80, "Dokument Mieszany - Strona 2")
    
    # Skomplikowana grafika wektorowa
    colors = [Color(1, 0, 0), Color(0, 1, 0), Color(0, 0, 1)]
    for i in range(3):
        c.setFillColor(colors[i])
        c.rect(100 + i * 120, height - 300, 100, 150, fill=1, stroke=0)
    
    c.showPage()
    
    # Strona 3: Tylko tekst
    c.setFont("Helvetica-Bold", 18)
    c.drawString(150, height - 80, "Dokument Mieszany - Strona 3")
    
    c.setFont("Helvetica", 12)
    text_lines = [
        "Ta strona zawiera głównie tekst.",
        "Universal Document ID Generator",
        "Testuje różne typy zawartości",
        "w jednym dokumencie PDF.",
        "",
        "Metadane:",
        "- Autor: Test Generator",
        "- Data: 2025-01-15",
        "- Typ: Mieszany dokument"
    ]
    
    y_pos = height - 120
    for line in text_lines:
        c.drawString(50, y_pos, line)
        y_pos -= 25
    
    # Dodaj metadane
    c.setCreator("Universal Document ID Generator")
    c.setTitle("Test Mixed Document")
    c.setSubject("Document with mixed content types")
    c.setAuthor("Test Generator")
    
    c.save()

def cos(x):
    """Cosine function"""
    import math
    return math.cos(x)

def sin(x):
    """Sine function"""
    import math
    return math.sin(x)

def main():
    print("=" * 60)
    print("GENEROWANIE PRZYKŁADOWYCH DOKUMENTÓW UNIWERSALNYCH")
    print("=" * 60)
    
    samples_dir = Path("samples")
    universal_dir = samples_dir / "universal"
    universal_dir.mkdir(exist_ok=True)
    
    print(f"\nGenerowanie dokumentów w folderze: {universal_dir}")
    
    # PDF z grafiką
    print("  Tworzenie PDF z grafiką...")
    create_pdf_with_graphics(universal_dir / "pdf_with_graphics.pdf")
    
    # PDF ze zdjęciem
    print("  Tworzenie PDF ze zdjęciem...")
    create_pdf_with_image(universal_dir / "pdf_with_image.pdf")
    
    # PDF z wektorami
    print("  Tworzenie PDF z wektorami...")
    create_vector_graphics_pdf(universal_dir / "pdf_vectors_only.pdf")
    
    # PDF mieszany
    print("  Tworzenie PDF mieszanego...")
    create_mixed_document_pdf(universal_dir / "pdf_mixed_document.pdf")
    
    # Obrazy różne
    print("  Tworzenie obrazów testowych...")
    create_varied_images(universal_dir)
    
    # Pokaż statystyki
    print(f"\nWygenerowane pliki:")
    files = list(universal_dir.glob("*"))
    files = [f for f in files if f.is_file()]
    
    total_size = sum(f.stat().st_size for f in files)
    
    for file in sorted(files):
        size = file.stat().st_size
        print(f"  {file.name:<25} [{size:>7}B]")
    
    print(f"\nRazem: {len(files)} plików, {total_size}B")
    
    print(f"\n{'=' * 60}")
    print("GENEROWANIE ZAKOŃCZONE")
    print(f"{'=' * 60}")

if __name__ == "__main__":
    main()
