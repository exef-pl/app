"""
Universal Document ID Generator for any document type including images, graphics, vectors
"""

import hashlib
import json
from pathlib import Path
from typing import Dict, Any, Optional, Union
from dataclasses import dataclass
from enum import Enum
import os
import time

try:
    import fitz  # PyMuPDF
    PYMUPDF_AVAILABLE = True
except ImportError:
    PYMUPDF_AVAILABLE = False

try:
    from PIL import Image, ImageChops, ImageStat
    PIL_AVAILABLE = True
except ImportError:
    PIL_AVAILABLE = False

try:
    import numpy as np
    NUMPY_AVAILABLE = True
except ImportError:
    NUMPY_AVAILABLE = False

class DocumentType(Enum):
    """Universal document types"""
    PDF = "PDF"
    IMAGE = "IMG"
    VECTOR = "VEC"
    MIXED = "MIX"
    UNKNOWN = "UNK"

@dataclass
class UniversalDocumentFeatures:
    """Universal features extracted from any document"""
    file_type: str
    file_size: int
    content_hash: str
    visual_hash: Optional[str] = None
    text_hash: Optional[str] = None
    metadata_hash: Optional[str] = None
    structure_hash: Optional[str] = None
    color_profile_hash: Optional[str] = None
    dimensions: Optional[tuple] = None
    page_count: Optional[int] = None
    creation_time: Optional[float] = None
    modification_time: Optional[float] = None

class UniversalDocumentIDGenerator:
    """Universal document ID generator for any document format"""
    
    def __init__(self, prefix: str = "UNIV"):
        self.prefix = prefix
    
    def extract_pdf_features(self, file_path: Union[str, Path]) -> UniversalDocumentFeatures:
        """Extract features from PDF documents"""
        if not PYMUPDF_AVAILABLE:
            raise ImportError("PyMuPDF (fitz) is required for PDF processing")
        
        doc = fitz.open(str(file_path))
        
        try:
            # Basic file info
            stat = Path(file_path).stat()
            file_size = stat.st_size
            creation_time = stat.st_ctime
            modification_time = stat.st_mtime
            
            # Content features
            content_features = []
            text_content = ""
            
            for page_num in range(len(doc)):
                page = doc[page_num]
                
                # Extract text
                page_text = page.get_text()
                text_content += page_text
                content_features.append(f"page_{page_num}_text_length:{len(page_text)}")
                
                # Extract images info
                image_list = page.get_images()
                content_features.append(f"page_{page_num}_images:{len(image_list)}")
                
                # Extract page dimensions
                rect = page.rect
                content_features.append(f"page_{page_num}_size:{rect.width:.2f}x{rect.height:.2f}")
                
                # Extract drawings/vectors
                drawings = page.get_drawings()
                content_features.append(f"page_{page_num}_drawings:{len(drawings)}")
                
                # Extract font information
                font_info = page.get_fonts()
                content_features.append(f"page_{page_num}_fonts:{len(font_info)}")
            
            # Metadata
            metadata = doc.metadata
            metadata_str = json.dumps(metadata, sort_keys=True)
            
            # Calculate hashes
            content_hash = hashlib.sha256('\n'.join(content_features).encode()).hexdigest()[:16]
            text_hash = hashlib.sha256(text_content.encode()).hexdigest()[:16] if text_content else None
            metadata_hash = hashlib.sha256(metadata_str.encode()).hexdigest()[:16]
            
            # Visual hash (first page rendered as image)
            visual_hash = None
            try:
                first_page = doc[0]
                pix = first_page.get_pixmap(matrix=fitz.Matrix(0.5, 0.5))  # Lower resolution for hash
                img_data = pix.tobytes("png")
                visual_hash = hashlib.sha256(img_data).hexdigest()[:16]
            except:
                pass
            
            return UniversalDocumentFeatures(
                file_type="PDF",
                file_size=file_size,
                content_hash=content_hash,
                text_hash=text_hash,
                metadata_hash=metadata_hash,
                visual_hash=visual_hash,
                dimensions=(doc[0].rect.width, doc[0].rect.height) if len(doc) > 0 else None,
                page_count=len(doc),
                creation_time=creation_time,
                modification_time=modification_time
            )
        
        finally:
            doc.close()
    
    def extract_image_features(self, file_path: Union[str, Path]) -> UniversalDocumentFeatures:
        """Extract features from image files"""
        if not PIL_AVAILABLE:
            raise ImportError("PIL (Pillow) is required for image processing")
        
        with Image.open(file_path) as img:
            stat = Path(file_path).stat()
            file_size = stat.st_size
            creation_time = stat.st_ctime
            modification_time = stat.st_mtime
            
            # Convert to RGB for consistent processing
            if img.mode != 'RGB':
                img = img.convert('RGB')
            
            # Basic features
            dimensions = img.size
            mode = img.mode
            
            # Visual hash
            # Resize to standard size for consistent hashing
            img_resized = img.resize((64, 64), Image.Resampling.LANCZOS)
            visual_hash = hashlib.sha256(img_resized.tobytes()).hexdigest()[:16]
            
            # Color histogram hash
            histogram = img.histogram()
            color_hash = hashlib.sha256(str(histogram).encode()).hexdigest()[:16]
            
            # Content hash based on multiple features
            content_features = [
                f"size:{dimensions[0]}x{dimensions[1]}",
                f"mode:{mode}",
                f"visual_hash:{visual_hash}",
                f"color_hash:{color_hash}",
                f"file_size:{file_size}"
            ]
            content_hash = hashlib.sha256('\n'.join(content_features).encode()).hexdigest()[:16]
            
            return UniversalDocumentFeatures(
                file_type="IMAGE",
                file_size=file_size,
                content_hash=content_hash,
                visual_hash=visual_hash,
                color_profile_hash=color_hash,
                dimensions=dimensions,
                creation_time=creation_time,
                modification_time=modification_time
            )
    
    def extract_generic_features(self, file_path: Union[str, Path]) -> UniversalDocumentFeatures:
        """Extract basic features from any file type"""
        stat = Path(file_path).stat()
        file_size = stat.st_size
        creation_time = stat.st_ctime
        modification_time = stat.st_mtime
        
        # Basic file content hash
        try:
            with open(file_path, 'rb') as f:
                content_hash = hashlib.sha256(f.read()).hexdigest()[:16]
        except:
            content_hash = hashlib.sha256(str(file_size).encode()).hexdigest()[:16]
        
        # File extension
        file_ext = Path(file_path).suffix.lower()
        
        return UniversalDocumentFeatures(
            file_type=file_ext.upper().replace('.', ''),
            file_size=file_size,
            content_hash=content_hash,
            creation_time=creation_time,
            modification_time=modification_time
        )
    
    def get_document_features(self, file_path: Union[str, Path]) -> UniversalDocumentFeatures:
        """Extract features based on file type"""
        file_path = Path(file_path)
        
        if not file_path.exists():
            raise FileNotFoundError(f"File not found: {file_path}")
        
        file_ext = file_path.suffix.lower()
        
        if file_ext == '.pdf':
            return self.extract_pdf_features(file_path)
        elif file_ext in ['.jpg', '.jpeg', '.png', '.gif', '.bmp', '.tiff', '.webp']:
            return self.extract_image_features(file_path)
        else:
            return self.extract_generic_features(file_path)
    
    def generate_universal_id(self, file_path: Union[str, Path]) -> str:
        """Generate universal document ID"""
        features = self.get_document_features(file_path)
        
        # Create canonical data string
        canonical_data = [
            features.file_type,
            str(features.file_size),
            features.content_hash,
            features.visual_hash or "",
            features.text_hash or "",
            features.metadata_hash or "",
            features.structure_hash or "",
            features.color_profile_hash or "",
            str(features.dimensions) if features.dimensions else "",
            str(features.page_count) if features.page_count else "",
            str(int(features.creation_time)) if features.creation_time else "",
            str(int(features.modification_time)) if features.modification_time else ""
        ]
        
        canonical_string = "|".join(canonical_data)
        
        # Generate hash
        hash_value = hashlib.sha256(canonical_string.encode()).hexdigest()[:16].upper()
        
        # Determine document type code
        type_codes = {
            'PDF': 'PDF',
            'IMAGE': 'IMG',
            'JPG': 'IMG',
            'JPEG': 'IMG',
            'PNG': 'IMG',
            'GIF': 'IMG',
            'BMP': 'IMG',
            'TIFF': 'IMG',
            'WEBP': 'IMG',
        }
        
        type_code = type_codes.get(features.file_type, features.file_type[:3].upper())
        
        return f"{self.prefix}-{type_code}-{hash_value}"
    
    def verify_universal_id(self, file_path: Union[str, Path], document_id: str) -> bool:
        """Verify universal document ID"""
        try:
            generated_id = self.generate_universal_id(file_path)
            return generated_id == document_id
        except:
            return False
    
    def parse_universal_id(self, document_id: str) -> Dict[str, Any]:
        """Parse universal document ID"""
        parts = document_id.split('-')
        if len(parts) != 3:
            raise ValueError(f"Invalid universal document ID format: {document_id}")
        
        prefix, type_code, hash_value = parts
        
        return {
            'prefix': prefix,
            'type_code': type_code,
            'hash': hash_value,
            'document_type': type_code
        }
    
    def compare_documents(self, file_path1: Union[str, Path], file_path2: Union[str, Path]) -> Dict[str, Any]:
        """Compare two documents"""
        features1 = self.get_document_features(file_path1)
        features2 = self.get_document_features(file_path2)
        
        id1 = self.generate_universal_id(file_path1)
        id2 = self.generate_universal_id(file_path2)
        
        comparison = {
            'identical_ids': id1 == id2,
            'id1': id1,
            'id2': id2,
            'same_type': features1.file_type == features2.file_type,
            'same_size': features1.file_size == features2.file_size,
            'same_content_hash': features1.content_hash == features2.content_hash,
            'same_visual_hash': None,
            'same_text_hash': None
        }
        
        if features1.visual_hash and features2.visual_hash:
            comparison['same_visual_hash'] = features1.visual_hash == features2.visual_hash
        
        if features1.text_hash and features2.text_hash:
            comparison['same_text_hash'] = features1.text_hash == features2.text_hash
        
        return comparison

# Convenience functions
def generate_universal_document_id(file_path: Union[str, Path]) -> str:
    """Generate universal document ID"""
    generator = UniversalDocumentIDGenerator()
    return generator.generate_universal_id(file_path)

def verify_universal_document_id(file_path: Union[str, Path], document_id: str) -> bool:
    """Verify universal document ID"""
    generator = UniversalDocumentIDGenerator()
    return generator.verify_universal_id(file_path, document_id)

def compare_universal_documents(file_path1: Union[str, Path], file_path2: Union[str, Path]) -> Dict[str, Any]:
    """Compare two universal documents"""
    generator = UniversalDocumentIDGenerator()
    return generator.compare_documents(file_path1, file_path2)
