#!/bin/bash
pip3 install streamlit pandas httpx playwright playwright-stealth --break-system-packages
python3 -m playwright install chromium
python3 scraper.py
