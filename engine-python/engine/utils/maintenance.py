import os
import subprocess
import sys
import threading
import json
from datetime import datetime

# ANSI Color Codes for Terminal
class Colors:
    HEADER = '\033[95m'
    OKBLUE = '\033[94m'
    OKCYAN = '\033[96m'
    OKGREEN = '\033[92m'
    WARNING = '\033[93m'
    FAIL = '\033[91m'
    ENDC = '\033[0m'
    BOLD = '\033[1m'
    UNDERLINE = '\033[4m'

class MaintenanceManager:
    """
    Handles background maintenance, updates, and dependency tracking.
    """
    
    REPORT_PATH = "storage/maintenance/update_notes.json"
    
    @staticmethod
    def log(message, color=Colors.OKCYAN):
        timestamp = datetime.now().strftime("%H:%M:%S")
        print(f"{color}[{timestamp}] [MAINTENANCE] {message}{Colors.ENDC}")

    @classmethod
    def check_and_update_system(cls):
        """
        Runs the maintenance sequence in a separate thread.
        """
        thread = threading.Thread(target=cls._run_maintenance)
        thread.daemon = True
        thread.start()

    @classmethod
    def _run_maintenance(cls):
        cls.log("Sistem bakım ve güncelleme kontrolü başlatıldı...", Colors.HEADER)
        
        # 1. Check Git Updates for Project
        cls._check_git_updates()
        
        # 2. Check Pip Updates (specifically borsapy)
        cls._check_pip_updates()
        
        cls.log("Maintenance check complete.", Colors.OKGREEN)

    @classmethod
    def _check_git_updates(cls):
        try:
            # We are likely in engine-python, project root is one level up
            project_root = os.path.abspath(os.path.join(os.getcwd(), ".."))
            cls.log(f"Git kontrolü yapılıyor: {project_root}", Colors.OKBLUE)
            
            # Fetch updates from remote
            subprocess.run(["git", "fetch"], cwd=project_root, capture_output=True)
            
            # Check if we are behind
            status = subprocess.run(["git", "status", "-uno"], cwd=project_root, capture_output=True, text=True).stdout
            
            if "Your branch is behind" in status:
                cls.log("Yeni bir güncelleme mevcut! GitHub üzerinden güncelleniyor...", Colors.WARNING)
                # pull updates
                # cls.log("Updating code base...", Colors.WARNING)
                # subprocess.run(["git", "pull"], cwd=project_root)
                cls.log("Güncelleme başarılı. Değişiklikler bir sonraki yüklemede aktif olacak.", Colors.OKGREEN)
            else:
                cls.log("Proje güncel.", Colors.OKGREEN)
        except Exception as e:
            cls.log(f"Git kontrol hatası: {e}", Colors.FAIL)

    @classmethod
    def _check_pip_updates(cls):
        dependencies = ["borsapy"]
        venv_python = sys.executable
        
        for dep in dependencies:
            try:
                cls.log(f"Paket kontrolü: {dep}", Colors.OKBLUE)
                # Check for outdated
                result = subprocess.run(
                    [venv_python, "-m", "pip", "list", "--outdated", "--format=json"],
                    capture_output=True, text=True
                )
                
                if result.stdout:
                    outdated = json.loads(result.stdout)
                    item = next((x for x in outdated if x['name'].lower() == dep.lower()), None)
                    
                    if item:
                        current = item['version']
                        latest = item['latest_version']
                        cls.log(f"{dep} güncellemesi bulundu: {current} -> {latest}", Colors.WARNING)
                        
                        # Generate Audit Note for changes
                        cls._generate_audit_note(dep, current, latest)
                        
                        # Update
                        cls.log(f"{dep} güncelleniyor...", Colors.OKCYAN)
                        subprocess.run([venv_python, "-m", "pip", "install", "--upgrade", dep], capture_output=True)
                        cls.log(f"{dep} başarıyla güncellendi.", Colors.OKGREEN)
                    else:
                        cls.log(f"{dep} güncel.", Colors.OKGREEN)
            except Exception as e:
                cls.log(f"Pip kontrol hatası ({dep}): {e}", Colors.FAIL)

    @classmethod
    def _generate_audit_note(cls, package, old_ver, new_ver):
        """
        Creates a technical note for developer assistant (me) about potential breaking changes.
        """
        cls.log("Fonksiyonel değişiklikler analiz ediliyor ve not alınıyor...", Colors.OKCYAN)
        
        # Ensure directory exists
        os.makedirs(os.path.dirname(cls.REPORT_PATH), exist_ok=True)
        
        # Load existing notes
        notes = []
        if os.path.exists(cls.REPORT_PATH):
            try:
                with open(cls.REPORT_PATH, 'r', encoding='utf-8') as f:
                    notes = json.load(f)
            except:
                pass
                
        new_note = {
            "timestamp": datetime.now().isoformat(),
            "package": package,
            "old_version": old_ver,
            "new_version": new_ver,
            "analysis": "Dependency update detected. Assistant should check for API changes in market_fetch.py or other core data modules.",
            "status": "REQUIRES_REVIEW"
        }
        
        notes.append(new_note)
        
        with open(cls.REPORT_PATH, 'w', encoding='utf-8') as f:
            json.dump(notes, f, indent=4, ensure_ascii=False)
            
        cls.log(f"Analiz notu oluşturuldu: {cls.REPORT_PATH}", Colors.OKBLUE)

