"""
View WKT on Interactive Map
============================
Team: Nova Matrics - VI
"""
import folium
import webbrowser
import os

# ================= YOUR WKT =================
WKT = "POLYGON((91.35 22.95, 91.55 22.95, 91.55 23.15, 91.35 23.15, 91.35 22.95))"

# ================= PARSE WKT =================
# Extract coordinates from WKT
coords_str = WKT.replace("POLYGON((", "").replace("))", "")
coords_list = []
for pair in coords_str.split(","):
    lon, lat = map(float, pair.strip().split())
    coords_list.append([lat, lon])  # Folium uses [lat, lon]

# Calculate center
center_lat = sum(c[0] for c in coords_list) / len(coords_list)
center_lon = sum(c[1] for c in coords_list) / len(coords_list)

print(f"Center: ({center_lat}, {center_lon})")
print(f"Corners: {coords_list}")

# ================= CREATE MAP =================
m = folium.Map(
    location=[center_lat, center_lon],
    zoom_start=11,
    tiles="OpenStreetMap"
)

# Add satellite layer
folium.TileLayer(
    tiles="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
    attr="Esri World Imagery",
    name="Satellite",
    overlay=False
).add_to(m)

# Draw the polygon
folium.Polygon(
    locations=coords_list,
    color="red",
    weight=3,
    fill=True,
    fillColor="red",
    fillOpacity=0.2,
    popup="Feni Flood AOI"
).add_to(m)

# Add center marker
folium.Marker(
    [center_lat, center_lon],
    popup=f"Center: {center_lat:.4f}, {center_lon:.4f}",
    icon=folium.Icon(color="blue", icon="info-sign")
).add_to(m)

# Add layer control
folium.LayerControl().add_to(m)

# ================= SAVE =================
output_file = os.path.join(os.path.dirname(__file__), "wkt_map.html")
m.save(output_file)

print(f"\n✅ Map saved to: {output_file}")

# Open in browser automatically
webbrowser.open(f"file://{output_file}")
print("Opening in browser...")