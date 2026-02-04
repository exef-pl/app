#!/usr/bin/env python3
"""
Test jakości generowania ID z różnymi silnikami OCR i poziomami zaszumienia
"""

import os
import sys
import tempfile
import json
import time
from pathlib import Path
from typing import Dict, List, Tuple, Any
import numpy as np
from PIL import Image, ImageFilter, ImageEnhance
import argparse

# Add parent directory to path
sys.path.insert(0, str(Path(__file__).parent.parent))

from exef_docid import (
    process_document,
    generate_universal_document_id,
    verify_universal_document_id
)
from exef_docid.ocr_processor import OCREngine
from exef_docid.document_id_universal import UniversalDocumentIDGenerator


class QualityTester:
    """Tester jakości generowania ID"""
    
    def __init__(self):
        self.results = {}
    
    def add_noise(self, image: Image.Image, noise_type: str, intensity: float) -> Image.Image:
        """Dodaj szum do obrazu"""
        img_array = np.array(image)
        
        if noise_type == "gaussian":
            # Szum gaussowski
            noise = np.random.normal(0, intensity * 255, img_array.shape)
            img_array = np.clip(img_array + noise, 0, 255).astype(np.uint8)
        
        elif noise_type == "salt_pepper":
            # Sól i pieprz
            mask = np.random.random(img_array.shape[:2])
            salt = mask > (1 - intensity/2)
            pepper = mask < intensity/2
            
            if len(img_array.shape) == 3:
                salt = np.stack([salt] * img_array.shape[2], axis=-1)
                pepper = np.stack([pepper] * img_array.shape[2], axis=-1)
            
            img_array[salt] = 255
            img_array[pepper] = 0
        
        elif noise_type == "blur":
            # Rozmycie
            img = Image.fromarray(img_array)
            img = img.filter(ImageFilter.GaussianBlur(radius=intensity * 5))
            return img
        
        elif noise_type == "brightness":
            # Zmiana jasności
            img = Image.fromarray(img_array)
            enhancer = ImageEnhance.Brightness(img)
            img = enhancer.enhance(1 + intensity)
            return img
        
        elif noise_type == "contrast":
            # Zmiana kontrastu
            img = Image.fromarray(img_array)
            enhancer = ImageEnhance.Contrast(img)
            img = enhancer.enhance(1 + intensity)
            return img
        
        return Image.fromarray(img_array)
    
    def test_ocr_engines(self, file_path: str, iterations: int = 10) -> Dict[str, Any]:
        """Testuj różne silniki OCR"""
        print(f"\n🔧 Testowanie silników OCR dla: {Path(file_path).name}")
        print("=" * 60)
        
        results = {
            "file": file_path,
            "iterations": iterations,
            "engines": {}
        }
        
        # Testuj bez OCR (uniwersalny generator)
        print("\n1. Test bez OCR (uniwersalny generator):")
        universal_ids = []
        universal_times = []
        
        for i in range(iterations):
            start = time.time()
            doc_id = generate_universal_document_id(file_path)
            end = time.time()
            
            universal_ids.append(doc_id)
            universal_times.append(end - start)
        
        unique_universal = len(set(universal_ids))
        avg_time = sum(universal_times) / len(universal_times)
        
        results["engines"]["none"] = {
            "deterministic": unique_universal == 1,
            "unique_ids": unique_universal,
            "avg_time": avg_time,
            "first_id": universal_ids[0],
            "all_ids": list(set(universal_ids))
        }
        
        print(f"   Deterministyczny: {'✅' if unique_universal == 1 else '❌'}")
        print(f"   Unikalnych ID: {unique_universal}/{iterations}")
        print(f"   Średni czas: {avg_time:.3f}s")
        
        # Testuj z różnymi silnikami OCR
        for engine in [OCREngine.PADDLE, OCREngine.TESSERACT]:
            engine_name = engine.value
            print(f"\n2. Test z {engine_name}:")
            
            ocr_ids = []
            ocr_times = []
            confidences = []
            
            for i in range(iterations):
                try:
                    start = time.time()
                    result = process_document(file_path, ocr_engine=engine, use_ocr=True)
                    end = time.time()
                    
                    ocr_ids.append(result.document_id)
                    ocr_times.append(end - start)
                    confidences.append(result.ocr_confidence)
                except Exception as e:
                    print(f"   Błąd w iteracji {i+1}: {e}")
                    continue
            
            if ocr_ids:
                unique_ocr = len(set(ocr_ids))
                avg_time = sum(ocr_times) / len(ocr_times)
                avg_confidence = sum(confidences) / len(confidences)
                
                results["engines"][engine_name] = {
                    "deterministic": unique_ocr == 1,
                    "unique_ids": unique_ocr,
                    "avg_time": avg_time,
                    "avg_confidence": avg_confidence,
                    "first_id": ocr_ids[0],
                    "all_ids": list(set(ocr_ids))
                }
                
                print(f"   Deterministyczny: {'✅' if unique_ocr == 1 else '❌'}")
                print(f"   Unikalnych ID: {unique_ocr}/{len(ocr_ids)}")
                print(f"   Średni czas: {avg_time:.3f}s")
                print(f"   Średnia pewność: {avg_confidence:.2%}")
            else:
                print(f"   ❌ Wszystkie iteracje nie powiodły się")
                results["engines"][engine_name] = {
                    "deterministic": False,
                    "unique_ids": 0,
                    "error": "All iterations failed"
                }
        
        return results
    
    def test_noise_resistance(self, file_path: str, noise_types: List[str], 
                            intensities: List[float], iterations: int = 5) -> Dict[str, Any]:
        """Test odporności na szumy"""
        print(f"\n🔧 Test odporności na szumy dla: {Path(file_path).name}")
        print("=" * 60)
        
        # Wczytaj obraz
        if not file_path.lower().endswith(('.png', '.jpg', '.jpeg')):
            print("❌ Plik musi być obrazem (PNG/JPG)")
            return {}
        
        original_img = Image.open(file_path)
        results = {
            "file": file_path,
            "noise_tests": {}
        }
        
        for noise_type in noise_types:
            print(f"\nTest szumu: {noise_type}")
            results["noise_tests"][noise_type] = {}
            
            for intensity in intensities:
                print(f"  Intensywność: {intensity:.2f}", end=" ")
                
                noise_ids = []
                
                for i in range(iterations):
                    # Dodaj szum
                    noisy_img = self.add_noise(original_img, noise_type, intensity)
                    
                    # Zapisz tymczasowy plik
                    with tempfile.NamedTemporaryFile(suffix='.png', delete=False) as tmp:
                        noisy_img.save(tmp.name)
                        tmp_path = tmp.name
                    
                    try:
                        # Przetwarzaj z OCR
                        result = process_document(tmp_path, use_ocr=True)
                        noise_ids.append(result.document_id)
                    except Exception as e:
                        print(f"Błąd: {e}", end=" ")
                    finally:
                        os.unlink(tmp_path)
                
                if noise_ids:
                    unique = len(set(noise_ids))
                    deterministic = unique == 1
                    
                    results["noise_tests"][noise_type][f"intensity_{intensity:.2f}"] = {
                        "deterministic": deterministic,
                        "unique_ids": unique,
                        "total_iterations": len(noise_ids)
                    }
                    
                    print(f"→ {'✅' if deterministic else '❌'} ({unique}/{len(noise_ids)} unikalnych)")
                else:
                    print("→ ❌ (brak wyników)")
        
        return results
    
    def test_format_consistency(self, base_file: str, formats: List[str]) -> Dict[str, Any]:
        """Test spójności między formatami"""
        print(f"\n🔧 Test spójności między formatami")
        print("=" * 60)
        
        results = {
            "base_file": base_file,
            "formats": {},
            "summary": {}
        }
        
        # Wczytaj oryginalny obraz
        if base_file.lower().endswith(('.png', '.jpg', '.jpeg')):
            original_img = Image.open(base_file)
            
            for format_name in formats:
                print(f"\nKonwersja do: {format_name}")
                
                # Konwertuj obraz
                with tempfile.NamedTemporaryFile(suffix=f'.{format_name}', delete=False) as tmp:
                    if format_name.lower() in ['jpg', 'jpeg']:
                        # Konwertuj do RGB dla JPG
                        if original_img.mode != 'RGB':
                            rgb_img = original_img.convert('RGB')
                            rgb_img.save(tmp.name, quality=95)
                        else:
                            original_img.save(tmp.name, quality=95)
                    else:
                        original_img.save(tmp.name)
                    
                    tmp_path = tmp.name
                
                try:
                    # Przetwarzaj
                    result = process_document(tmp_path, use_ocr=True)
                    
                    results["formats"][format_name] = {
                        "document_id": result.document_id,
                        "confidence": result.ocr_confidence,
                        "file_size": os.path.getsize(tmp_path)
                    }
                    
                    print(f"  ID: {result.document_id}")
                    print(f"  Pewność: {result.ocr_confidence:.2%}")
                    print(f"  Rozmiar: {os.path.getsize(tmp_path)}B")
                    
                except Exception as e:
                    print(f"  ❌ Błąd: {e}")
                    results["formats"][format_name] = {"error": str(e)}
                finally:
                    os.unlink(tmp_path)
            
            # Podsumowanie
            all_ids = [f.get("document_id") for f in results["formats"].values() if "document_id" in f]
            unique_ids = set(all_ids)
            
            results["summary"] = {
                "total_formats": len(formats),
                "successful": len(all_ids),
                "unique_ids": len(unique_ids),
                "consistent": len(unique_ids) == 1,
                "all_ids": list(unique_ids)
            }
            
            print(f"\n📊 Podsumowanie:")
            print(f"  Przetworzono: {len(all_ids)}/{len(formats)} formatów")
            print(f"  Unikalnych ID: {len(unique_ids)}")
            print(f"  Spójne: {'✅' if len(unique_ids) == 1 else '❌'}")
        
        return results
    
    def generate_report(self, output_file: str = None):
        """Generuj raport z testów"""
        if not output_file:
            output_file = f"quality_report_{int(time.time())}.json"
        
        with open(output_file, 'w', encoding='utf-8') as f:
            json.dump(self.results, f, indent=2, ensure_ascii=False, default=str)
        
        print(f"\n📊 Raport zapisany w: {output_file}")
        return output_file


def main():
    """Główna funkcja testująca"""
    parser = argparse.ArgumentParser(description="Test jakości generowania ID")
    parser.add_argument("file", help="Plik do testowania")
    parser.add_argument("--iterations", "-n", type=int, default=10, help="Liczba iteracji")
    parser.add_argument("--noise", action="store_true", help="Testuj odporność na szumy")
    parser.add_argument("--formats", action="store_true", help="Testuj spójność formatów")
    parser.add_argument("--output", "-o", help="Plik wyjściowy raportu")
    parser.add_argument("--all", action="store_true", help="Uruchom wszystkie testy")
    
    args = parser.parse_args()
    
    if not Path(args.file).exists():
        print(f"❌ Plik nie istnieje: {args.file}")
        return 1
    
    tester = QualityTester()
    
    # Test silników OCR
    tester.results["ocr_engines"] = tester.test_ocr_engines(args.file, args.iterations)
    
    # Test odporności na szumy
    if args.noise or args.all:
        noise_types = ["gaussian", "salt_pepper", "blur", "brightness", "contrast"]
        intensities = [0.05, 0.1, 0.2, 0.3]
        tester.results["noise_resistance"] = tester.test_noise_resistance(
            args.file, noise_types, intensities, args.iterations // 2
        )
    
    # Test spójności formatów
    if args.formats or args.all:
        formats = ["png", "jpg", "jpeg", "bmp", "tiff"]
        tester.results["format_consistency"] = tester.test_format_consistency(args.file, formats)
    
    # Generuj raport
    report_file = tester.generate_report(args.output)
    
    # Podsumowanie
    print("\n" + "=" * 60)
    print("PODSUMOWANIE TESTU JAKOŚCI")
    print("=" * 60)
    
    # Najlepszy silnik OCR
    if "ocr_engines" in tester.results:
        best_engine = None
        best_score = -1
        
        for engine, data in tester.results["ocr_engines"]["engines"].items():
            if "deterministic" in data and data["deterministic"]:
                score = data.get("avg_confidence", 0)
                if score > best_score:
                    best_score = score
                    best_engine = engine
        
        if best_engine:
            print(f"✅ Najlepszy silnik OCR: {best_engine}")
            print(f"   Pewność: {best_score:.2%}")
        else:
            print("❌ Żaden silnik OCR nie był w 100% deterministyczny")
    
    print(f"\n📄 Szczegółowy raport: {report_file}")
    
    return 0


if __name__ == "__main__":
    sys.exit(main())
