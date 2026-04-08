import borsapy as bp
import requests
from bs4 import BeautifulSoup
import re
import os

def explore_kap(symbol):
    print(f"Exploring KAP for {symbol}...")
    t = bp.Ticker(symbol)
    
    # Get news
    news = t.news
    if news is None or news.empty:
        print("No news found.")
        return
    
    print("\nRecent Announcements:")
    print(news.head(10)[['Date', 'Title', 'URL']])
    
    # Look for Activity Reports (Faaliyet Raporu)
    reports = news[news['Title'].str.contains("Faaliyet Raporu", case=False, na=False)]
    if not reports.empty:
        print("\nActivity Reports Found:")
        print(reports[['Date', 'Title', 'URL']])
        latest_report_url = reports.iloc[0]['URL']
        print(f"\nLatest Report URL: {latest_report_url}")
        
        # Go to the URL and find PDF
        response = requests.get(latest_report_url)
        soup = BeautifulSoup(response.content, 'html.parser')
        
        # Find PDF links
        pdf_links = []
        for a in soup.find_all('a', href=True):
            if '.pdf' in a['href'].lower():
                full_url = a['href']
                if not full_url.startswith('http'):
                    full_url = "https://www.kap.org.tr" + full_url
                pdf_links.append(full_url)
        
        print(f"PDF Links: {pdf_links}")
    else:
        print("\nNo Activity Reports found in recent news.")

    # Look for Financial Statements
    financials = news[news['Title'].str.contains("Finansal Rapor", case=False, na=False)]
    if not financials.empty:
        print("\nFinancial Reports Found:")
        print(financials[['Date', 'Title', 'URL']])

if __name__ == "__main__":
    explore_kap("ASELS")
