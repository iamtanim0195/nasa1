# 🛰️ Nova Matrics - VI | NISAR Mission Dashboard

**NASA Space Apps Challenge 2026**

![Status](https://img.shields.io/badge/Status-In%20Progress-yellow)
![Python](https://img.shields.io/badge/Python-3.14-blue)
![License](https://img.shields.io/badge/License-MIT-green)

---

## 📌 Project Overview

This project is developed for the **NASA Space Apps Challenge 2026**, focusing on the challenge:

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
| **Md. Shafaet Ullah** | Backend (BE1 + BE2) | Vice President, Programming Club |
| **Fardin Ahmed** | Backend (BE1 + BE2) | Joint Secretary, Programming Club |

> **Analyzed by:** Md. Shafaet Ullah & Fardin Ahmed — Programming Club

---

## 🎯 Challenge Details

**Challenge:** Dancing with the SARs (NISAR Mission)

**NISAR** is a joint mission between NASA and ISRO. It uses **L-band Synthetic Aperture Radar** to observe Earth's surface 24/7, regardless of weather or daylight.

**Our Goal:** Build an interactive visualization system that processes NISAR SAR data to detect surface changes, specifically focusing on flood and vegetation analysis in Bangladesh.

---

## 📁 Project Structure
NISAR_Project/
│  
├── src/  
│ ├── be1_data_pipeline/  
│ │ ├── search_nisar.py  
│ │ ├── download_nisar.py  
│ │ ├── analyze_h5.py  
│ │ └── data_density_map.py  
│ │  
│ └── be2_processing/  
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
