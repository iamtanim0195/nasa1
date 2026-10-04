\# 🛰️ Nova Matrics - VI | NISAR Mission Dashboard



\*\*NASA Space Apps Challenge 2026\*\*



!\[Status](https://img.shields.io/badge/Status-In%20Progress-yellow)

!\[Python](https://img.shields.io/badge/Python-3.14-blue)

!\[License](https://img.shields.io/badge/License-MIT-green)



\---



\## 📌 Project Overview



This project is developed for the \*\*NASA Space Apps Challenge 2026\*\*, focusing on the challenge:



> \*\*"Dancing with the SARs"\*\* — Analyze Earth's surface changes using NISAR (NASA-ISRO Synthetic Aperture Radar) data.



We process L-band SAR data to detect changes in:

\- 🌊 Floods and water bodies

\- 🏔️ Landslides and surface deformation

\- 🧊 Glaciers and ice sheets

\- 🌳 Vegetation and forest cover



\---



\## 👥 Team: Nova Matrics - VI



| Name | Role | Position |

| :--- | :--- | :--- |

| \*\*Md. Shafaet Ullah\*\* | Backend (BE1 + BE2) | Vice President, Programming Club |

| \*\*Fardin Ahmed\*\* | Backend (BE1 + BE2) | Joint Secretary, Programming Club |



> \*\*Analyzed by:\*\* Md. Shafaet Ullah \& Fardin Ahmed — Programming Club



\---



\## 🎯 Challenge Details



\*\*Challenge:\*\* Dancing with the SARs (NISAR Mission)



\*\*NISAR\*\* is a joint mission between NASA and ISRO. It uses \*\*L-band Synthetic Aperture Radar\*\* to observe Earth's surface 24/7, regardless of weather or daylight.



\*\*Our Goal:\*\* Build an interactive visualization system that processes NISAR SAR data to detect surface changes, specifically focusing on flood and vegetation analysis in Bangladesh.



\---



\## 📁 Project Structure

NISAR\_Project/

│

├── src/

│ ├── be1\_data\_pipeline/ # BE1: Data download \& acquisition

│ │ ├── search\_nisar.py # Search NISAR data on Earthdata

│ │ ├── download\_nisar.py # Download NISAR HDF5 files

│ │ ├── analyze\_h5.py # Analyze HDF5 structure

│ │ └── data\_density\_map.py # Find data-rich regions

│ │

│ └── be2\_processing/ # BE2: Image processing \& visualization

│ ├── extract\_backscatter.py # Extract HH/HV layers

│ ├── quicklook.py # Generate quicklook preview

│ └── test\_crop.py # Test crop locations

│

├── notebooks/ # Jupyter notebooks (future)

├── docs/ # Documentation

├── scripts/ # Shell scripts

├── output/ # Generated outputs (not in Git)

├── nisar\_data/ # Downloaded HDF5 files (not in Git)

└── venv/ # Virtual environment (not in Git)





\---



\## 🚀 Quick Start



\### 1. Clone the Repository



```bash

git clone https://github.com/iamtanim0195/nasa1.git

cd nasa1

