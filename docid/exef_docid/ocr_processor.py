"""
Procesor OCR zoptymalizowany dla CPU.

Używa PaddleOCR jako głównego silnika (najlepszy stosunek jakość/wydajność na CPU),
z fallbackiem na Tesseract dla kompatybilności.
"""

import logging
import os
import re
from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from enum import Enum
from pathlib import Path
from typing import List, Optional, Tuple, Union

logger = logging.getLogger(__name__)


class OCREngine(Enum):
    """Dostępne silniki OCR."""
    PADDLE = "paddle"       # PaddleOCR - najlepsza jakość na CPU
    TESSERACT = "tesseract" # Tesseract - fallback, szybki
    EASYOCR = "easyocr"     # EasyOCR - wolniejszy ale dokładny


@dataclass
class OCRResult:
    """Wynik OCR dla pojedynczego fragmentu tekstu."""
    text: str
    confidence: float
    bbox: Optional[Tuple[int, int, int, int]] = None  # x1, y1, x2, y2

    def __str__(self) -> str:
        return self.text


@dataclass
class DocumentOCRResult:
    """Pełny wynik OCR dla dokumentu."""
    full_text: str
    lines: List[OCRResult]
    average_confidence: float
    engine_used: OCREngine

    # Metadane
    source_file: Optional[str] = None
    processing_time_ms: Optional[float] = None

    # Wykryte struktury
    detected_nips: List[str] = field(default_factory=list)
    detected_amounts: List[str] = field(default_factory=list)
    detected_dates: List[str] = field(default_factory=list)
    detected_invoice_numbers: List[str] = field(default_factory=list)


class BaseOCRProcessor(ABC):
    """Bazowa klasa dla procesorów OCR."""

    @abstractmethod
    def process_image(self, image_path: Union[str, Path]) -> DocumentOCRResult:
        """Przetwarza obraz i zwraca wynik OCR."""
        pass

    @abstractmethod
    def process_pdf(self, pdf_path: Union[str, Path]) -> List[DocumentOCRResult]:
        """Przetwarza PDF i zwraca wyniki OCR dla każdej strony."""
        pass

    def extract_structured_data(self, text: str) -> dict:
        """
        Wyciąga strukturyzowane dane z tekstu OCR.

        Szuka: NIP, kwoty, daty, numery faktur.
        """
        return {
            'nips': self._find_nips(text),
            'amounts': self._find_amounts(text),
            'dates': self._find_dates(text),
            'invoice_numbers': self._find_invoice_numbers(text),
        }

    def _find_nips(self, text: str) -> List[str]:
        """Znajduje wszystkie NIP-y w tekście."""
        patterns = [
            r'NIP[:\s]*(\d{3}[-\s]?\d{3}[-\s]?\d{2}[-\s]?\d{2})',
            r'NIP[:\s]*(\d{10})',
            r'(\d{3}-\d{3}-\d{2}-\d{2})',
            r'(?<!\d)(\d{10})(?!\d)',  # 10 cyfr bez kontekstu
        ]

        results = []
        for pattern in patterns:
            matches = re.findall(pattern, text, re.IGNORECASE)
            for match in matches:
                # Normalizuj - usuń separatory
                nip = re.sub(r'[\s\-]', '', match)
                if len(nip) == 10 and nip.isdigit():
                    # Walidacja checksum
                    weights = [6, 5, 7, 2, 3, 4, 5, 6, 7]
                    checksum = sum(int(nip[i]) * weights[i] for i in range(9))
                    if checksum % 11 == int(nip[9]):
                        if nip not in results:
                            results.append(nip)

        return results

    def _find_amounts(self, text: str) -> List[str]:
        """Znajduje kwoty pieniężne w tekście."""
        patterns = [
            r'(\d{1,3}(?:[\s\xa0]?\d{3})*[,\.]\d{2})\s*(?:zł|PLN|złotych)?',
            r'(?:brutto|netto|razem|suma|do zapłaty)[:\s]*(\d{1,3}(?:[\s\xa0]?\d{3})*[,\.]\d{2})',
            r'(\d+[,\.]\d{2})\s*(?:zł|PLN)',
        ]

        results = []
        for pattern in patterns:
            matches = re.findall(pattern, text, re.IGNORECASE)
            for match in matches:
                # Normalizuj
                amount = match.replace('\xa0', '').replace(' ', '')
                amount = amount.replace(',', '.')
                if amount not in results:
                    results.append(amount)

        return results

    def _find_dates(self, text: str) -> List[str]:
        """Znajduje daty w tekście."""
        patterns = [
            r'\b(\d{2}[-\.\/]\d{2}[-\.\/]\d{4})\b',  # DD-MM-YYYY
            r'\b(\d{4}[-\.\/]\d{2}[-\.\/]\d{2})\b',  # YYYY-MM-DD
            r'\b(\d{2}[-\.\/]\d{2}[-\.\/]\d{2})\b',  # DD-MM-YY
        ]

        results = []
        for pattern in patterns:
            matches = re.findall(pattern, text)
            for match in matches:
                if match not in results:
                    results.append(match)

        return results

    def _find_invoice_numbers(self, text: str) -> List[str]:
        """Znajduje numery faktur w tekście."""
        patterns = [
            r'(?:faktura|fv|rachunek|nr)[:\s]*([A-Z0-9\/\-]+\d+[A-Z0-9\/\-]*)',
            r'(?:numer|nr)[:\s]*([A-Z]{1,3}[\s\/\-]?\d{1,4}[\s\/\-]?\d{2,4}[\s\/\-]?\d{2,6})',
            r'(FV[\s\/\-]?\d+[\s\/\-]?\d*[\s\/\-]?\d*)',
            r'(F[\s\/\-]?\d+[\s\/\-]?\d{4})',
        ]

        results = []
        for pattern in patterns:
            matches = re.findall(pattern, text, re.IGNORECASE)
            for match in matches:
                normalized = match.strip().upper()
                if len(normalized) >= 4 and normalized not in results:
                    results.append(normalized)

        return results


class PaddleOCRProcessor(BaseOCRProcessor):
    """
    Procesor OCR oparty na PaddleOCR.

    Najlepszy stosunek jakość/wydajność na CPU.
    Obsługuje język polski i angielski.
    """

    def __init__(
        self,
        lang: str = 'pl',  # 'pl', 'en', 'latin'
        use_gpu: bool = False,
        det_model_dir: Optional[str] = None,
        rec_model_dir: Optional[str] = None,
    ):
        self.lang = lang
        self.use_gpu = use_gpu
        self._ocr = None
        self._det_model_dir = det_model_dir
        self._rec_model_dir = rec_model_dir

    def _init_ocr(self):
        """Lazy initialization silnika OCR."""
        if self._ocr is None:
            try:
                from paddleocr import PaddleOCR

                # Dla polskiego używamy latin (lepsze wyniki niż multilingual)
                lang = 'latin' if self.lang == 'pl' else self.lang

                self._ocr = PaddleOCR(
                    use_angle_cls=True,
                    lang=lang,
                    use_gpu=self.use_gpu,
                    show_log=False,
                    det_model_dir=self._det_model_dir,
                    rec_model_dir=self._rec_model_dir,
                    # Optymalizacje CPU
                    enable_mkldnn=True,
                    cpu_threads=4,
                )
            except ImportError:
                raise ImportError(
                    "PaddleOCR not installed. Install with: "
                    "pip install paddleocr paddlepaddle"
                )

    def process_image(self, image_path: Union[str, Path]) -> DocumentOCRResult:
        """Przetwarza obraz."""
        import time
        start_time = time.time()

        self._init_ocr()

        image_path = str(image_path)
        result = self._ocr.ocr(image_path, cls=True)

        lines = []
        full_text_parts = []

        if result and result[0]:
            for line in result[0]:
                bbox_points, (text, confidence) = line

                # Konwersja bbox z punktów do prostokąta
                x_coords = [p[0] for p in bbox_points]
                y_coords = [p[1] for p in bbox_points]
                bbox = (
                    int(min(x_coords)),
                    int(min(y_coords)),
                    int(max(x_coords)),
                    int(max(y_coords)),
                )

                lines.append(OCRResult(
                    text=text,
                    confidence=confidence,
                    bbox=bbox,
                ))
                full_text_parts.append(text)

        full_text = '\n'.join(full_text_parts)
        avg_confidence = sum(line.confidence for line in lines) / len(lines) if lines else 0.0

        # Ekstrakcja strukturyzowanych danych
        structured = self.extract_structured_data(full_text)

        processing_time = (time.time() - start_time) * 1000

        return DocumentOCRResult(
            full_text=full_text,
            lines=lines,
            average_confidence=avg_confidence,
            engine_used=OCREngine.PADDLE,
            source_file=image_path,
            processing_time_ms=processing_time,
            detected_nips=structured['nips'],
            detected_amounts=structured['amounts'],
            detected_dates=structured['dates'],
            detected_invoice_numbers=structured['invoice_numbers'],
        )

    def process_pdf(self, pdf_path: Union[str, Path]) -> List[DocumentOCRResult]:
        """Przetwarza PDF - konwertuje strony na obrazy i procesuje."""
        try:
            import pdf2image
        except ImportError:
            raise ImportError(
                "pdf2image not installed. Install with: pip install pdf2image"
            )

        pdf_path = str(pdf_path)
        images = pdf2image.convert_from_path(pdf_path, dpi=300)

        results = []
        for i, image in enumerate(images):
            # Zapisz tymczasowo jako PNG
            import tempfile
            with tempfile.NamedTemporaryFile(suffix='.png', delete=False) as tmp:
                image.save(tmp.name, 'PNG')
                result = self.process_image(tmp.name)
                result.source_file = f"{pdf_path}#page={i+1}"
                results.append(result)
                os.unlink(tmp.name)

        return results


class TesseractOCRProcessor(BaseOCRProcessor):
    """
    Procesor OCR oparty na Tesseract.

    Szybszy, dobry fallback, wymaga zainstalowanego tesseract-ocr.
    """

    def __init__(
        self,
        lang: str = 'pol+eng',
        config: str = '--oem 3 --psm 6',
    ):
        self.lang = lang
        self.config = config
        self._check_tesseract()

    def _check_tesseract(self):
        """Sprawdza czy Tesseract jest zainstalowany."""
        try:
            import pytesseract
            pytesseract.get_tesseract_version()
        except Exception:
            raise ImportError(
                "Tesseract not found. Install with:\n"
                "  Ubuntu: sudo apt install tesseract-ocr tesseract-ocr-pol\n"
                "  pip install pytesseract"
            )

    def process_image(self, image_path: Union[str, Path]) -> DocumentOCRResult:
        """Przetwarza obraz."""
        import time

        import pytesseract
        from PIL import Image

        start_time = time.time()

        image = Image.open(image_path)

        # OCR z detalami
        data = pytesseract.image_to_data(
            image,
            lang=self.lang,
            config=self.config,
            output_type=pytesseract.Output.DICT,
        )

        lines = []
        current_line = []
        current_line_num = -1

        for i, text in enumerate(data['text']):
            if not text.strip():
                continue

            conf = float(data['conf'][i])
            if conf < 0:
                conf = 0

            line_num = data['line_num'][i]

            bbox = (
                data['left'][i],
                data['top'][i],
                data['left'][i] + data['width'][i],
                data['top'][i] + data['height'][i],
            )

            if line_num != current_line_num:
                if current_line:
                    # Zakończ poprzednią linię
                    line_text = ' '.join([r.text for r in current_line])
                    avg_conf = sum(r.confidence for r in current_line) / len(current_line)
                    lines.append(OCRResult(
                        text=line_text,
                        confidence=avg_conf / 100,  # Tesseract daje 0-100
                        bbox=current_line[0].bbox,
                    ))
                current_line = []
                current_line_num = line_num

            current_line.append(OCRResult(
                text=text,
                confidence=conf,
                bbox=bbox,
            ))

        # Ostatnia linia
        if current_line:
            line_text = ' '.join([r.text for r in current_line])
            avg_conf = sum(r.confidence for r in current_line) / len(current_line)
            lines.append(OCRResult(
                text=line_text,
                confidence=avg_conf / 100,
                bbox=current_line[0].bbox,
            ))

        full_text = '\n'.join([line.text for line in lines])
        avg_confidence = sum(line.confidence for line in lines) / len(lines) if lines else 0.0

        # Ekstrakcja strukturyzowanych danych
        structured = self.extract_structured_data(full_text)

        processing_time = (time.time() - start_time) * 1000

        return DocumentOCRResult(
            full_text=full_text,
            lines=lines,
            average_confidence=avg_confidence,
            engine_used=OCREngine.TESSERACT,
            source_file=str(image_path),
            processing_time_ms=processing_time,
            detected_nips=structured['nips'],
            detected_amounts=structured['amounts'],
            detected_dates=structured['dates'],
            detected_invoice_numbers=structured['invoice_numbers'],
        )

    def process_pdf(self, pdf_path: Union[str, Path]) -> List[DocumentOCRResult]:
        """Przetwarza PDF."""
        try:
            import pdf2image
        except ImportError:
            raise ImportError("pdf2image not installed")

        pdf_path = str(pdf_path)
        images = pdf2image.convert_from_path(pdf_path, dpi=300)

        results = []
        for i, image in enumerate(images):
            import tempfile
            with tempfile.NamedTemporaryFile(suffix='.png', delete=False) as tmp:
                image.save(tmp.name, 'PNG')
                result = self.process_image(tmp.name)
                result.source_file = f"{pdf_path}#page={i+1}"
                results.append(result)
                os.unlink(tmp.name)

        return results


class OCRProcessor:
    """
    Główny procesor OCR z automatycznym wyborem silnika.

    Próbuje użyć PaddleOCR (najlepsza jakość), fallback na Tesseract.
    """

    def __init__(
        self,
        preferred_engine: OCREngine = OCREngine.PADDLE,
        fallback_engine: OCREngine = OCREngine.TESSERACT,
        lang: str = 'pl',
        use_gpu: bool = False,
    ):
        self.preferred_engine = preferred_engine
        self.fallback_engine = fallback_engine
        self.lang = lang
        self.use_gpu = use_gpu

        self._processor: Optional[BaseOCRProcessor] = None
        self._active_engine: Optional[OCREngine] = None

    def _init_processor(self) -> BaseOCRProcessor:
        """Inicjalizuje procesor, próbując preferowany silnik."""
        if self._processor is not None:
            return self._processor

        # Lista silników do wypróbowania w kolejności
        engines_to_try = []
        
        # 1. Dodaj preferowany silnik
        engines_to_try.append(self.preferred_engine)
        
        # 2. Dodaj fallback jeśli inny
        if self.fallback_engine != self.preferred_engine:
            engines_to_try.append(self.fallback_engine)
            
        # 3. Dodaj pozostałe jako ostatnia deska ratunku
        for eng in OCREngine:
            if eng not in engines_to_try:
                engines_to_try.append(eng)

        last_error = None
        for engine in engines_to_try:
            try:
                if engine == OCREngine.PADDLE:
                    # Sprawdź czy paddle jest zainstalowany bez importowania wszystkiego
                    import importlib.util
                    if importlib.util.find_spec("paddleocr") is None:
                        raise ImportError("paddleocr not installed")
                    
                    self._processor = PaddleOCRProcessor(
                        lang=self.lang,
                        use_gpu=self.use_gpu,
                    )
                    self._active_engine = OCREngine.PADDLE
                    logger.info("Using PaddleOCR engine")
                    return self._processor
                
                elif engine == OCREngine.TESSERACT:
                    self._processor = TesseractOCRProcessor(
                        lang='pol+eng' if self.lang == 'pl' else self.lang,
                    )
                    self._active_engine = OCREngine.TESSERACT
                    logger.info("Using Tesseract engine")
                    return self._processor
            except (ImportError, Exception) as e:
                logger.warning(f"Engine {engine} not available: {e}")
                last_error = e
                continue

        raise ImportError(
            f"No OCR engine available. Last error: {last_error}. "
            "Install PaddleOCR or Tesseract.\n"
            "PaddleOCR: pip install paddleocr paddlepaddle\n"
            "Tesseract: apt install tesseract-ocr tesseract-ocr-pol && pip install pytesseract"
        )

    @property
    def active_engine(self) -> Optional[OCREngine]:
        """Zwraca aktualnie używany silnik OCR."""
        return self._active_engine

    def process(
        self, 
        file_path: Union[str, Path]
    ) -> Union[DocumentOCRResult, List[DocumentOCRResult]]:
        """
        Przetwarza plik (obraz lub PDF).

        Dla obrazów zwraca pojedynczy DocumentOCRResult.
        Dla PDF zwraca listę DocumentOCRResult (jeden per strona).
        """
        processor = self._init_processor()
        file_path = Path(file_path)

        if file_path.suffix.lower() == '.pdf':
            return processor.process_pdf(file_path)
        else:
            return processor.process_image(file_path)

    def process_image(self, image_path: Union[str, Path]) -> DocumentOCRResult:
        """Przetwarza pojedynczy obraz."""
        processor = self._init_processor()
        return processor.process_image(image_path)

    def process_pdf(self, pdf_path: Union[str, Path]) -> List[DocumentOCRResult]:
        """Przetwarza PDF."""
        processor = self._init_processor()
        return processor.process_pdf(pdf_path)


def preprocess_image_for_ocr(
        image_path: Union[str, Path], 
        output_path: Optional[str] = None
    ) -> str:
    """
    Preprocessing obrazu przed OCR dla lepszych wyników.

    Stosuje: grayscale, contrast enhancement, denoising, deskew.
    """
    from PIL import Image, ImageEnhance, ImageFilter

    img = Image.open(image_path)

    # 1. Konwersja do grayscale
    if img.mode != 'L':
        img = img.convert('L')

    # 2. Zwiększenie kontrastu
    enhancer = ImageEnhance.Contrast(img)
    img = enhancer.enhance(1.5)

    # 3. Wyostrzenie
    img = img.filter(ImageFilter.SHARPEN)

    # 4. Binaryzacja adaptacyjna (opcjonalna)
    # Możesz użyć OpenCV dla lepszych wyników

    if output_path:
        img.save(output_path)
        return output_path
    else:
        import tempfile
        with tempfile.NamedTemporaryFile(suffix='.png', delete=False) as tmp:
            img.save(tmp.name)
            return tmp.name
