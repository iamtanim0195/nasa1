# 🛰️ Nova Matrics - VI ( Earth-Metamorphosis ) | NISAR Mission Dashboard

**NASA Space Apps Challenge 2026**

![Status](https://img.shields.io/badge/Status-In%20Progress-yellow)
![Python](https://img.shields.io/badge/Python-3.14-blue)
![License](https://img.shields.io/badge/License-MIT-green)

---

## 📌 Project Overview

This project is developed for the **NASA Space Apps Challenge 2026**, focusing on the challenge No. 06:

> **"Dancing with the SARs"** — Analyze Earth's surface changes using NISAR (NASA-ISRO Synthetic Aperture Radar) data.

We process L-band SAR data to detect changes in:
- 🌊 Floods and water bodies
- 🏔️ Landslides and surface deformation
- 🧊 Glaciers and ice sheets
- 🌳 Vegetation and forest cover

---

## 👥 Team: Nova Matrics - VI

| Name | Role | Position |
| :--- | :--- | :--- |
| **Md. Sahadat Hossen Tanim** | Team Leader, AI/Ml | Vice President, Programming Club | President, Programming Club |
| **Md. Shafaet Ullah** | Backend System Designer, API Integrator & Git Controller | Vice President, Programming Club |
| **Ahmed Fardin** | Frontend, Data Analyst, Editor & Team Former | Joint Secretary, Programming Club |
| **Ridwan Ahmed** | Frontend & Concept Designer | General Member, Programming Club |
| **Md. Shakhawat Hossain Shuvo** | Researcher & API Integrator | General Member, Programming Club |
| **Umme Habiba Islam** | Presenter, Script Writter & Story Teller | General Member, Programming Club |

> **Analyzed by:** Md. Shafaet Ullah & Fardin Ahmed — Programming Club, HAMDARD UNIVERSITY BANGLADESH

---

## 🎯 Challenge Details

**Challenge:** Dancing with the SARs (NISAR Mission)

**NISAR** is a joint mission between NASA and ISRO. It uses **L-band Synthetic Aperture Radar** to observe Earth's surface 24/7, regardless of weather or daylight.

**Our Goal:** Build an interactive visualization system that processes NISAR SAR data to detect surface changes, specifically focusing on flood and vegetation analysis in Bangladesh as Bangladesh is a riverine and Agricultural Country.

---

## 📁 Project Structure
Earth-Metamorphosis/
│  
├── backend/  
│ ├── api/  
│ │ ├── models/ 
│ │ |      └── __init__.py    
│ │ ├── routers/
| | |      ├─ __init__.py
| | |      ├─ analyze.py
| | |      ├─ events.py
| | |      ├─ mission.py
| | |      ├─ nisar.py
| | |      ├─ results.py
| | |      └── search_location.py
│ │ ├── services/
│ │ |      ├─ __init__.py
| | |      ├─ ai_predictor.py
| | |      ├─ dem.py
| | |      ├─ envelope.py
| | |      ├─ nisar_processor.py
| | |      └── __init__.py 
│   └── __init__.py
│ ├── core/
| | |   ├─ create_flood_overlay.py
| | |   ├─ diagonse.py
| | |   ├─ events.py
| | |   ├─ mission.py
│ ├── extract_backscatter.py  
│ ├── quicklook.py  
│ └── test_crop.py  
│  
├── notebooks/  
├── docs/  
├── scripts/  
├── output/  
├── nisar_data/  
└── venv/  


---

## 🚀 Quick Start

### 1. Clone the Repository

```bash
git clone https://github.com/iamtanim0195/nasa1.git
cd nasa1
