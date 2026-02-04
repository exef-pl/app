"""Test email client for viewing received emails."""
import json
import os
import re
import webbrowser
from datetime import datetime
from typing import List, Dict, Optional
import subprocess
import sys

class EmailClient:
    """Client for viewing test emails."""
    
    def __init__(self, email_dir: str = './test_emails'):
        self.email_dir = email_dir
        os.makedirs(email_dir, exist_ok=True)
    
    def list_emails(self) -> List[Dict]:
        """List all received emails."""
        emails = []
        
        if not os.path.exists(self.email_dir):
            return emails
        
        for filename in os.listdir(self.email_dir):
            if filename.endswith('.json'):
                filepath = os.path.join(self.email_dir, filename)
                try:
                    with open(filepath, 'r', encoding='utf-8') as f:
                        email_data = json.load(f)
                        email_data['filename'] = filename
                        emails.append(email_data)
                except Exception as e:
                    print(f"❌ Error reading {filename}: {e}")
        
        # Sort by timestamp (newest first)
        emails.sort(key=lambda x: x.get('timestamp', ''), reverse=True)
        return emails
    
    def get_latest_email(self) -> Optional[Dict]:
        """Get the latest email."""
        emails = self.list_emails()
        return emails[0] if emails else None
    
    def get_email_by_filename(self, filename: str) -> Optional[Dict]:
        """Get email by filename."""
        filepath = os.path.join(self.email_dir, filename)
        if os.path.exists(filepath):
            try:
                with open(filepath, 'r', encoding='utf-8') as f:
                    return json.load(f)
            except Exception as e:
                print(f"❌ Error reading {filename}: {e}")
        return None
    
    def extract_magic_link(self, email_data: Dict) -> Optional[str]:
        """Extract magic link from email."""
        if 'magic_link' in email_data and email_data['magic_link']:
            return email_data['magic_link']
        
        # Try to extract from raw content
        raw = email_data.get('raw', '')
        
        # Look for magic link patterns
        patterns = [
            r'http://localhost:\d+/api/v1/auth/magic-link\?token=[a-zA-Z0-9_-]+',
            r'https?://[^\s<>"{}|\\^`[\]]*magic-link[^\s<>"{}|\\^`[\]]*',
        ]
        
        for pattern in patterns:
            match = re.search(pattern, raw)
            if match:
                return match.group(0)
        
        return None
    
    def open_magic_link(self, email_data: Dict) -> bool:
        """Open magic link in browser."""
        magic_link = self.extract_magic_link(email_data)
        if magic_link:
            print(f"🔗 Opening magic link: {magic_link}")
            webbrowser.open(magic_link)
            return True
        else:
            print("❌ No magic link found in email")
            return False
    
    def display_email(self, email_data: Dict):
        """Display email content."""
        print("\n" + "="*60)
        print(f"📧 Email from: {email_data.get('from', 'Unknown')}")
        print(f"📬 To: {', '.join(email_data.get('to', []))}")
        print(f"📅 Time: {email_data.get('timestamp', 'Unknown')}")
        print(f"📋 Subject: {email_data.get('subject', 'No Subject')}")
        
        magic_link = self.extract_magic_link(email_data)
        if magic_link:
            print(f"🔗 Magic Link: {magic_link}")
        
        print("-"*60)
        print("📄 Content:")
        print(email_data.get('raw', 'No content'))
        print("="*60)
    
    def watch_emails(self):
        """Watch for new emails interactively."""
        print("👁️  EXEF3 Email Client - Watching for new emails...")
        print("📁 Email directory:", self.email_dir)
        print("⌨️  Commands:")
        print("  l - List emails")
        print("  n - Show latest email")
        print("  o - Open magic link from latest email")
        print("  q - Quit")
        print("  h - Help")
        
        last_count = 0
        
        while True:
            try:
                current_count = len([f for f in os.listdir(self.email_dir) if f.endswith('.json')])
                
                if current_count > last_count:
                    print(f"\n📧 New email received! ({current_count - last_count} new)")
                    latest = self.get_latest_email()
                    if latest:
                        self.display_email(latest)
                        magic_link = self.extract_magic_link(latest)
                        if magic_link:
                            print(f"\n🔗 Magic link available! Press 'o' to open.")
                    last_count = current_count
                
                command = input("\n⌨️  Enter command (h for help): ").strip().lower()
                
                if command == 'q':
                    break
                elif command == 'l':
                    emails = self.list_emails()
                    if emails:
                        print(f"\n📧 {len(emails)} emails:")
                        for i, email in enumerate(emails, 1):
                            print(f"  {i}. {email.get('subject', 'No Subject')} - {email.get('from', 'Unknown')} ({email.get('timestamp', 'Unknown')})")
                    else:
                        print("📭 No emails found")
                elif command == 'n':
                    latest = self.get_latest_email()
                    if latest:
                        self.display_email(latest)
                    else:
                        print("📭 No emails found")
                elif command == 'o':
                    latest = self.get_latest_email()
                    if latest:
                        self.open_magic_link(latest)
                    else:
                        print("📭 No emails found")
                elif command == 'h':
                    print("\n⌨️  Commands:")
                    print("  l - List emails")
                    print("  n - Show latest email")
                    print("  o - Open magic link from latest email")
                    print("  q - Quit")
                    print("  h - Help")
                else:
                    print("❌ Unknown command. Press 'h' for help.")
                    
            except KeyboardInterrupt:
                print("\n👋 Goodbye!")
                break
            except Exception as e:
                print(f"❌ Error: {e}")

def main():
    """Main function for email client."""
    import argparse
    
    parser = argparse.ArgumentParser(description='EXEF3 Test Email Client')
    parser.add_argument('--dir', default='./test_emails', help='Email directory')
    parser.add_argument('--list', action='store_true', help='List emails and exit')
    parser.add_argument('--latest', action='store_true', help='Show latest email and exit')
    parser.add_argument('--open-latest', action='store_true', help='Open magic link from latest email')
    
    args = parser.parse_args()
    
    client = EmailClient(args.dir)
    
    if args.list:
        emails = client.list_emails()
        if emails:
            print(f"📧 {len(emails)} emails:")
            for i, email in enumerate(emails, 1):
                print(f"  {i}. {email.get('subject', 'No Subject')} - {email.get('from', 'Unknown')}")
        else:
            print("📭 No emails found")
    elif args.latest:
        latest = client.get_latest_email()
        if latest:
            client.display_email(latest)
        else:
            print("📭 No emails found")
    elif args.open_latest:
        latest = client.get_latest_email()
        if latest:
            client.open_magic_link(latest)
        else:
            print("📭 No emails found")
    else:
        client.watch_emails()

if __name__ == "__main__":
    main()
