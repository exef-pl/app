#!/usr/bin/env python3
"""Setup dla DOC Document ID Generator."""

from setuptools import setup, find_packages
from pathlib import Path

this_directory = Path(__file__).parent
long_description = (this_directory / "README.md").read_text(encoding='utf-8')

setup(
    name="docid",
    version="0.1.0",
    author="Softreck",
    author_email="info@softreck.dev",
    description="Deterministyczny generator identyfikatorów dokumentów z OCR",
    long_description=long_description,
    long_description_content_type="text/markdown",
    url="https://github.com/softreck/docid",
    packages=find_packages(),
    classifiers=[
        "Development Status :: 3 - Alpha",
        "Intended Audience :: Developers",
        "License :: OSI Approved :: MIT License",
        "Operating System :: OS Independent",
        "Programming Language :: Python :: 3",
        "Programming Language :: Python :: 3.9",
        "Programming Language :: Python :: 3.10",
        "Programming Language :: Python :: 3.11",
        "Programming Language :: Python :: 3.12",
        "Topic :: Office/Business :: Financial :: Accounting",
        "Topic :: Text Processing :: General",
    ],
    python_requires=">=3.9",
    install_requires=[
        "pillow>=9.0.0",
        "pdf2image>=1.16.0",
    ],
    extras_require={
        "paddle": [
            "paddleocr>=2.6.0",
            "paddlepaddle>=2.4.0",  # CPU version
        ],
        "tesseract": [
            "pytesseract>=0.3.10",
        ],
        "all": [
            "paddleocr>=2.6.0",
            "paddlepaddle>=2.4.0",
            "pytesseract>=0.3.10",
        ],
        "dev": [
            "pytest>=7.0.0",
            "pytest-cov>=4.0.0",
            "black>=23.0.0",
            "mypy>=1.0.0",
        ],
    },
    entry_points={
        "console_scripts": [
            "docid=docid.cli:main",
        ],
    },
    include_package_data=True,
    zip_safe=False,
)
