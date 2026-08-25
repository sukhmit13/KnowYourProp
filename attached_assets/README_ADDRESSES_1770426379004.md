# Chicago Michelin Restaurant Database - With Full Addresses ✅

Complete database of Chicago Michelin Guide restaurants with **exact street addresses**, ready to use for mapping, geocoding, and distance calculations.

## 📊 Data Overview

**Last Updated**: February 6, 2026  
**Total Restaurants**: 49  
**Data Source**: Michelin Guide Chicago + Official Restaurant Websites

### Rating Breakdown
- **3 Stars**: 1 restaurant (Smyth)
- **2 Stars**: 1 restaurant (Alinea)
- **1 Star**: 8 restaurants
- **Bib Gourmand**: 9 restaurants (good value)
- **Selected Restaurants**: 30 restaurants

### Neighborhood Distribution
- West Loop: 24 restaurants (⭐ Restaurant Row)
- River North: 11 restaurants
- Lincoln Park: 2 restaurants
- Logan Square: 2 restaurants
- Gold Coast: 2 restaurants
- West Town: 2 restaurants
- Loop: 2 restaurants
- Pilsen, Streeterville, Little Italy, Lakeview: 1 each

## 📁 Files Included

### 1. `chicago_michelin_full_addresses.csv`
Complete CSV with all restaurant data including:
- Restaurant name
- Street address
- City, State, ZIP
- Full formatted address
- Michelin rating
- Cuisine type
- Price level ($-$$$$)
- Neighborhood

**Sample row:**
```csv
Smyth,177 N. Ada St.,Chicago,IL,60607,"177 N. Ada St., Chicago, IL 60607",3 Stars,Contemporary,$$$$,West Loop
```

### 2. `chicago_michelin_full_addresses.json`
Same data in JSON format for API integration:
```json
{
  "scraped_date": "2026-02-06",
  "total_restaurants": 49,
  "restaurants": [
    {
      "name": "Smyth",
      "address": "177 N. Ada St.",
      "city": "Chicago",
      "state": "IL",
      "zip": "60607",
      "full_address": "177 N. Ada St., Chicago, IL 60607",
      "rating": "3 Stars",
      "cuisine": "Contemporary",
      "price": "$$$$",
      "neighborhood": "West Loop"
    }
  ]
}
```

## 🗺️ Ready for Mapping!

These complete addresses are perfect for:

### Geocoding
```python
import googlemaps

gmaps = googlemaps.Client(key='YOUR_API_KEY')

# Geocode each restaurant
for restaurant in restaurants:
    result = gmaps.geocode(restaurant['full_address'])
    if result:
        location = result[0]['geometry']['location']
        restaurant['lat'] = location['lat']
        restaurant['lng'] = location['lng']
```

### Distance Calculations
```python
from geopy.distance import geodesic

user_location = (41.8781, -87.6298)  # Example: Downtown Chicago

for restaurant in restaurants:
    restaurant_location = (restaurant['lat'], restaurant['lng'])
    distance = geodesic(user_location, restaurant_location).miles
    restaurant['distance_miles'] = round(distance, 2)

# Sort by distance
nearby = sorted(restaurants, key=lambda x: x['distance_miles'])
```

### Zip Code Filtering
```python
# Find all restaurants in a specific zip code
zip_60607 = [r for r in restaurants if r['zip'] == '60607']
print(f"West Loop has {len(zip_60607)} Michelin restaurants!")
```

## 📍 Notable Addresses

### Three-Star
- **Smyth** - 177 N. Ada St., West Loop

### Two-Star  
- **Alinea** - 1723 N. Halsted St., Lincoln Park

### One-Star Highlights
- **Topolobampo** - 445 N. Clark St., River North (Mexican)
- **Oriole** - 661 W. Walnut St., West Loop
- **Indienne** - 217 W. Huron St., River North (Indian)

### Bib Gourmand Favorites (Best Value)
- **Girl & The Goat** - 809 W. Randolph St., West Loop
- **Taqueria Chingón** - 852 N. Ashland Ave., West Town (only $)

## 💻 Usage Examples

### Load the Data
```python
import csv

# From CSV
with open('chicago_michelin_full_addresses.csv', 'r') as f:
    reader = csv.DictReader(f)
    restaurants = list(reader)

# From JSON
import json
with open('chicago_michelin_full_addresses.json', 'r') as f:
    data = json.load(f)
    restaurants = data['restaurants']
```

### Filter by Neighborhood
```python
# West Loop restaurants
west_loop = [r for r in restaurants if r['neighborhood'] == 'West Loop']
print(f"Found {len(west_loop)} restaurants in West Loop")

# River North
river_north = [r for r in restaurants if r['neighborhood'] == 'River North']
```

### Filter by Price
```python
# Budget-friendly ($ or $$)
affordable = [r for r in restaurants if r['price'] in ['$', '$$']]

# Fine dining ($$$$ only)
fine_dining = [r for r in restaurants if r['price'] == '$$$$']
```

### Find Starred Restaurants
```python
# All Michelin-starred
starred = [r for r in restaurants if 'Star' in r['rating']]

# Just one-stars
one_star = [r for r in restaurants if r['rating'] == '1 Star']
```

### Search by Cuisine
```python
# Japanese restaurants
japanese = [r for r in restaurants if 'Japanese' in r['cuisine']]

# Italian
italian = [r for r in restaurants if 'Italian' in r['cuisine']]
```

## 🚀 Integration with Replit

### Step 1: Upload the Files
Upload both CSV and JSON files to your Replit project's data folder.

### Step 2: Basic App Example
```python
import csv
from flask import Flask, jsonify, request

app = Flask(__name__)

# Load restaurant data
with open('data/chicago_michelin_full_addresses.csv', 'r') as f:
    restaurants = list(csv.DictReader(f))

@app.route('/api/restaurants')
def get_restaurants():
    """Get all restaurants"""
    return jsonify(restaurants)

@app.route('/api/restaurants/neighborhood/<name>')
def get_by_neighborhood(name):
    """Get restaurants by neighborhood"""
    filtered = [r for r in restaurants if r['neighborhood'].lower() == name.lower()]
    return jsonify(filtered)

@app.route('/api/restaurants/search')
def search():
    """Search by cuisine, price, or rating"""
    cuisine = request.args.get('cuisine')
    price = request.args.get('price')
    rating = request.args.get('rating')
    
    results = restaurants
    
    if cuisine:
        results = [r for r in results if cuisine.lower() in r['cuisine'].lower()]
    if price:
        results = [r for r in results if r['price'] == price]
    if rating:
        results = [r for r in results if rating.lower() in r['rating'].lower()]
    
    return jsonify(results)

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5000)
```

## 🔍 Data Quality

### ✅ Complete Fields
- Name
- Street Address
- City, State, ZIP
- Michelin Rating
- Cuisine Type
- Price Level
- Neighborhood

### 🎯 Accuracy
All addresses verified from:
- Official restaurant websites
- Michelin Guide
- Yelp/Google Maps
- OpenTable/Tock

### 📅 Update Frequency
**Recommended**: Annual update after Michelin Guide release (typically November)

## 🛠️ Next Steps

### Add Geocoding
```python
# Using Google Maps API
def add_coordinates(restaurants):
    import googlemaps
    gmaps = googlemaps.Client(key='YOUR_API_KEY')
    
    for r in restaurants:
        try:
            result = gmaps.geocode(r['full_address'])
            if result:
                loc = result[0]['geometry']['location']
                r['latitude'] = loc['lat']
                r['longitude'] = loc['lng']
        except Exception as e:
            print(f"Error geocoding {r['name']}: {e}")
    
    return restaurants
```

### Add Distance from User
```python
from math import radians, cos, sin, asin, sqrt

def haversine(lon1, lat1, lon2, lat2):
    """Calculate distance between two points on Earth (in miles)"""
    lon1, lat1, lon2, lat2 = map(radians, [lon1, lat1, lon2, lat2])
    dlon = lon2 - lon1
    dlat = lat2 - lat1
    a = sin(dlat/2)**2 + cos(lat1) * cos(lat2) * sin(dlon/2)**2
    c = 2 * asin(sqrt(a))
    miles = 3956 * c
    return round(miles, 2)

# Usage
user_lat, user_lng = 41.8781, -87.6298  # Downtown Chicago
for r in restaurants:
    r['distance'] = haversine(user_lng, user_lat, r['longitude'], r['latitude'])

# Sort by distance
nearby = sorted(restaurants, key=lambda x: x['distance'])
```

### Add More Data Points
Consider scraping additional information:
- Phone numbers
- Website URLs
- Hours of operation
- Reservation links (OpenTable, Tock, Resy)
- Average price per person
- Parking availability
- Dress code

## 📝 Example Queries

### "Find all Michelin-starred restaurants within 2 miles of me"
```python
user_location = (41.8781, -87.6298)
starred_nearby = []

for r in restaurants:
    if 'Star' in r['rating']:
        if r.get('distance', 0) <= 2:
            starred_nearby.append(r)
```

### "Show me affordable ($-$$) Bib Gourmand restaurants"
```python
affordable_bibs = [
    r for r in restaurants 
    if r['rating'] == 'Bib Gourmand' and r['price'] in ['$', '$$']
]
```

### "Japanese restaurants in West Loop"
```python
japanese_west_loop = [
    r for r in restaurants
    if 'Japanese' in r['cuisine'] and r['neighborhood'] == 'West Loop'
]
```

## 📧 Contact & Updates

For questions or to report data issues, please create an issue in the repository.

---

**Ready to build your Chicago restaurant finder app!** 🎉

All addresses are complete and formatted for immediate use in mapping, geocoding, and distance calculations.
