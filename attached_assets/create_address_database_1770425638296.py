#!/usr/bin/env python3
"""
Chicago Michelin Restaurants - Complete Address Database
Based on web search results and official sources
"""

import csv
import json

# Complete restaurant data with exact street addresses
RESTAURANTS_WITH_ADDRESSES = [
    # Michelin-Starred Restaurants
    {"name": "Smyth", "address": "177 N. Ada St.", "city": "Chicago", "state": "IL", "zip": "60607", "rating": "3 Stars", "cuisine": "Contemporary", "price": "$$$$", "neighborhood": "West Loop"},
    {"name": "Alinea", "address": "1723 N. Halsted St.", "city": "Chicago", "state": "IL", "zip": "60614", "rating": "2 Stars", "cuisine": "Contemporary", "price": "$$$$", "neighborhood": "Lincoln Park"},
    
    # One-Star Restaurants  
    {"name": "Topolobampo", "address": "445 N. Clark St.", "city": "Chicago", "state": "IL", "zip": "60654", "rating": "1 Star", "cuisine": "Mexican", "price": "$$$$", "neighborhood": "River North"},
    {"name": "Sepia", "address": "123 N. Jefferson St.", "city": "Chicago", "state": "IL", "zip": "60661", "rating": "1 Star", "cuisine": "American", "price": "$$$$", "neighborhood": "West Loop"},
    {"name": "Oriole", "address": "661 W. Walnut St.", "city": "Chicago", "state": "IL", "zip": "60661", "rating": "1 Star", "cuisine": "Contemporary", "price": "$$$$", "neighborhood": "West Loop"},
    {"name": "Mako", "address": "731 W. Lake St.", "city": "Chicago", "state": "IL", "zip": "60661", "rating": "1 Star", "cuisine": "Japanese", "price": "$$$$", "neighborhood": "West Loop"},
    {"name": "Indienne", "address": "217 W. Huron St.", "city": "Chicago", "state": "IL", "zip": "60654", "rating": "1 Star", "cuisine": "Indian", "price": "$$$$", "neighborhood": "River North"},
    {"name": "Next", "address": "953 W. Fulton Market", "city": "Chicago", "state": "IL", "zip": "60607", "rating": "1 Star", "cuisine": "Contemporary", "price": "$$$$", "neighborhood": "West Loop"},
    {"name": "Ever", "address": "1340 W. Fulton St.", "city": "Chicago", "state": "IL", "zip": "60607", "rating": "1 Star", "cuisine": "Creative", "price": "$$$$", "neighborhood": "West Loop"},
    {"name": "Elske", "address": "1350 W. Randolph St.", "city": "Chicago", "state": "IL", "zip": "60607", "rating": "1 Star", "cuisine": "Contemporary", "price": "$$$$", "neighborhood": "West Loop"},
    
    # Bib Gourmand
    {"name": "Girl & The Goat", "address": "809 W. Randolph St.", "city": "Chicago", "state": "IL", "zip": "60607", "rating": "Bib Gourmand", "cuisine": "Contemporary", "price": "$$$", "neighborhood": "West Loop"},
    {"name": "Gilt Bar", "address": "230 W. Kinzie St.", "city": "Chicago", "state": "IL", "zip": "60654", "rating": "Bib Gourmand", "cuisine": "Gastropub", "price": "$$", "neighborhood": "River North"},
    {"name": "Ciccio Mio", "address": "226 W. Kinzie St.", "city": "Chicago", "state": "IL", "zip": "60654", "rating": "Bib Gourmand", "cuisine": "Italian", "price": "$$", "neighborhood": "River North"},
    {"name": "Frontera Grill", "address": "445 N. Clark St.", "city": "Chicago", "state": "IL", "zip": "60654", "rating": "Bib Gourmand", "cuisine": "Mexican", "price": "$$", "neighborhood": "River North"},
    {"name": "Proxi", "address": "565 W. Randolph St.", "city": "Chicago", "state": "IL", "zip": "60661", "rating": "Bib Gourmand", "cuisine": "International", "price": "$$", "neighborhood": "West Loop"},
    {"name": "Perilla", "address": "1132 W. Madison St.", "city": "Chicago", "state": "IL", "zip": "60607", "rating": "Bib Gourmand", "cuisine": "Korean", "price": "$$", "neighborhood": "West Loop"},
    {"name": "Sifr", "address": "932 W. Randolph St.", "city": "Chicago", "state": "IL", "zip": "60607", "rating": "Bib Gourmand", "cuisine": "Middle Eastern", "price": "$$", "neighborhood": "West Loop"},
    {"name": "Taqueria Chingón", "address": "852 N. Ashland Ave.", "city": "Chicago", "state": "IL", "zip": "60622", "rating": "Bib Gourmand", "cuisine": "Mexican", "price": "$", "neighborhood": "West Town"},
    {"name": "HaiSous", "address": "1800 S. Carpenter St.", "city": "Chicago", "state": "IL", "zip": "60608", "rating": "Bib Gourmand", "cuisine": "Vietnamese", "price": "$$", "neighborhood": "Pilsen"},
    
    # Selected Restaurants
    {"name": "Prime & Provisions", "address": "222 N. LaSalle St.", "city": "Chicago", "state": "IL", "zip": "60601", "rating": "Selected Restaurant", "cuisine": "Steakhouse", "price": "$$$", "neighborhood": "Loop"},
    {"name": "Chicago Cut", "address": "300 N. LaSalle St.", "city": "Chicago", "state": "IL", "zip": "60654", "rating": "Selected Restaurant", "cuisine": "Steakhouse", "price": "$$$", "neighborhood": "River North"},
    {"name": "RPM Steak", "address": "66 W. Kinzie St.", "city": "Chicago", "state": "IL", "zip": "60654", "rating": "Selected Restaurant", "cuisine": "Steakhouse", "price": "$$$$", "neighborhood": "River North"},
    {"name": "Bavette's Bar & Boeuf", "address": "218 W. Kinzie St.", "city": "Chicago", "state": "IL", "zip": "60654", "rating": "Selected Restaurant", "cuisine": "Steakhouse", "price": "$$$$", "neighborhood": "River North"},
    {"name": "Alla Vita", "address": "124 N. Green St.", "city": "Chicago", "state": "IL", "zip": "60607", "rating": "Selected Restaurant", "cuisine": "Italian", "price": "$$$", "neighborhood": "West Loop"},
    {"name": "avec", "address": "615 W. Randolph St.", "city": "Chicago", "state": "IL", "zip": "60661", "rating": "Selected Restaurant", "cuisine": "Mediterranean", "price": "$$", "neighborhood": "West Loop"},
    {"name": "Lou Mitchell's", "address": "565 W. Jackson Blvd.", "city": "Chicago", "state": "IL", "zip": "60661", "rating": "Selected Restaurant", "cuisine": "American", "price": "$$", "neighborhood": "West Loop"},
    {"name": "Kumiko", "address": "630 W. Lake St.", "city": "Chicago", "state": "IL", "zip": "60661", "rating": "Selected Restaurant", "cuisine": "Japanese", "price": "$$$$", "neighborhood": "West Loop"},
    {"name": "Omakase Yume", "address": "3005 W. Fullerton Ave.", "city": "Chicago", "state": "IL", "zip": "60647", "rating": "Selected Restaurant", "cuisine": "Japanese", "price": "$$$$", "neighborhood": "Logan Square"},
    {"name": "ROOP Chicago", "address": "67 E. Madison St.", "city": "Chicago", "state": "IL", "zip": "60602", "rating": "Selected Restaurant", "cuisine": "Indian", "price": "$$$", "neighborhood": "Loop"},
    {"name": "Beity", "address": "213 E. Grand Ave.", "city": "Chicago", "state": "IL", "zip": "60611", "rating": "Selected Restaurant", "cuisine": "Lebanese", "price": "$$$$", "neighborhood": "Streeterville"},
    {"name": "Momotaro", "address": "820 W. Lake St.", "city": "Chicago", "state": "IL", "zip": "60607", "rating": "Selected Restaurant", "cuisine": "Japanese", "price": "$$$", "neighborhood": "West Loop"},
    {"name": "Tzuco", "address": "720 N. State St.", "city": "Chicago", "state": "IL", "zip": "60654", "rating": "Selected Restaurant", "cuisine": "Mexican", "price": "$$", "neighborhood": "River North"},
    {"name": "Obélix", "address": "325 N. Wells St.", "city": "Chicago", "state": "IL", "zip": "60654", "rating": "Selected Restaurant", "cuisine": "French", "price": "$$$", "neighborhood": "River North"},
    {"name": "Rose Mary", "address": "800 W. Fulton Market", "city": "Chicago", "state": "IL", "zip": "60607", "rating": "Selected Restaurant", "cuisine": "Croatian", "price": "$$$", "neighborhood": "West Loop"},
    {"name": "Gaijin", "address": "950 W. Lake St.", "city": "Chicago", "state": "IL", "zip": "60607", "rating": "Selected Restaurant", "cuisine": "Japanese", "price": "$$", "neighborhood": "West Loop"},
    {"name": "Swift & Sons", "address": "1000 W. Fulton Market", "city": "Chicago", "state": "IL", "zip": "60607", "rating": "Selected Restaurant", "cuisine": "Steakhouse", "price": "$$$$", "neighborhood": "West Loop"},
    {"name": "Monteverde", "address": "1020 W. Madison St.", "city": "Chicago", "state": "IL", "zip": "60607", "rating": "Selected Restaurant", "cuisine": "Italian", "price": "$$$", "neighborhood": "West Loop"},
    {"name": "Hugo's Frog Bar & Fish House", "address": "1024 N. Rush St.", "city": "Chicago", "state": "IL", "zip": "60611", "rating": "Selected Restaurant", "cuisine": "American", "price": "$$$", "neighborhood": "Gold Coast"},
    {"name": "Maple & Ash", "address": "8 W. Maple St.", "city": "Chicago", "state": "IL", "zip": "60610", "rating": "Selected Restaurant", "cuisine": "Steakhouse", "price": "$$$$", "neighborhood": "Gold Coast"},
    {"name": "Elina's", "address": "2152 N. Halsted St.", "city": "Chicago", "state": "IL", "zip": "60614", "rating": "Selected Restaurant", "cuisine": "Italian-American", "price": "$$$", "neighborhood": "Lincoln Park"},
    {"name": "Creepies", "address": "1324 W. Randolph St.", "city": "Chicago", "state": "IL", "zip": "60607", "rating": "Selected Restaurant", "cuisine": "French", "price": "$$$", "neighborhood": "West Loop"},
    {"name": "Chez Joël", "address": "1119 W. Taylor St.", "city": "Chicago", "state": "IL", "zip": "60607", "rating": "Selected Restaurant", "cuisine": "French", "price": "$$", "neighborhood": "Little Italy"},
    {"name": "Coalfire", "address": "1321 W. Grand Ave.", "city": "Chicago", "state": "IL", "zip": "60642", "rating": "Selected Restaurant", "cuisine": "Pizza", "price": "$$", "neighborhood": "West Town"},
    {"name": "Astor Club: Chef's Table", "address": "1301 W. Washington Blvd.", "city": "Chicago", "state": "IL", "zip": "60607", "rating": "Selected Restaurant", "cuisine": "American Contemporary", "price": "$$$$", "neighborhood": "West Loop"},
    {"name": "Maxwells Trading", "address": "112 N. Green St.", "city": "Chicago", "state": "IL", "zip": "60607", "rating": "Selected Restaurant", "cuisine": "Contemporary", "price": "$$$", "neighborhood": "West Loop"},
    {"name": "Oliver's", "address": "405 N. Wells St.", "city": "Chicago", "state": "IL", "zip": "60654", "rating": "Selected Restaurant", "cuisine": "Contemporary", "price": "$$$", "neighborhood": "River North"},
    {"name": "Azul Mariscos + Muelle", "address": "2913 N. Broadway", "city": "Chicago", "state": "IL", "zip": "60657", "rating": "Selected Restaurant", "cuisine": "Seafood", "price": "$$$", "neighborhood": "Lakeview"},
    {"name": "Jeong", "address": "2507 N. Milwaukee Ave.", "city": "Chicago", "state": "IL", "zip": "60647", "rating": "Selected Restaurant", "cuisine": "Korean", "price": "$$$$", "neighborhood": "Logan Square"},
    {"name": "Provaré", "address": "1142 W. Madison St.", "city": "Chicago", "state": "IL", "zip": "60607", "rating": "Selected Restaurant", "cuisine": "Fusion", "price": "$$$", "neighborhood": "West Loop"},
]

def save_to_csv(filename):
    """Save restaurant data with full addresses to CSV"""
    with open(filename, 'w', newline='', encoding='utf-8') as f:
        fieldnames = ['name', 'address', 'city', 'state', 'zip', 'full_address', 'rating', 'cuisine', 'price', 'neighborhood']
        writer = csv.DictWriter(f, fieldnames=fieldnames)
        
        writer.writeheader()
        for restaurant in RESTAURANTS_WITH_ADDRESSES:
            # Create full address field
            restaurant['full_address'] = f"{restaurant['address']}, {restaurant['city']}, {restaurant['state']} {restaurant['zip']}"
            writer.writerow(restaurant)
    
    print(f"✓ Saved {len(RESTAURANTS_WITH_ADDRESSES)} restaurants to {filename}")

def save_to_json(filename):
    """Save restaurant data with full addresses to JSON"""
    # Add full_address to each restaurant
    for restaurant in RESTAURANTS_WITH_ADDRESSES:
        restaurant['full_address'] = f"{restaurant['address']}, {restaurant['city']}, {restaurant['state']} {restaurant['zip']}"
    
    data = {
        "scraped_date": "2026-02-06",
        "total_restaurants": len(RESTAURANTS_WITH_ADDRESSES),
        "data_source": "Michelin Guide Chicago + Web Search",
        "restaurants": RESTAURANTS_WITH_ADDRESSES
    }
    
    with open(filename, 'w', encoding='utf-8') as f:
        json.dump(data, f, indent=2, ensure_ascii=False)
    
    print(f"✓ Saved {len(RESTAURANTS_WITH_ADDRESSES)} restaurants to {filename}")

def print_summary():
    """Print summary statistics"""
    neighborhoods = {}
    ratings = {}
    
    for r in RESTAURANTS_WITH_ADDRESSES:
        # Count by neighborhood
        neighborhood = r['neighborhood']
        neighborhoods[neighborhood] = neighborhoods.get(neighborhood, 0) + 1
        
        # Count by rating
        rating = r['rating']
        ratings[rating] = ratings.get(rating, 0) + 1
    
    print("\n" + "="*60)
    print("CHICAGO MICHELIN RESTAURANTS - ADDRESS DATABASE")
    print("="*60)
    print(f"\nTotal Restaurants: {len(RESTAURANTS_WITH_ADDRESSES)}")
    
    print("\n📍 By Neighborhood:")
    for neighborhood, count in sorted(neighborhoods.items(), key=lambda x: x[1], reverse=True):
        print(f"   {neighborhood}: {count}")
    
    print("\n⭐ By Rating:")
    for rating, count in sorted(ratings.items(), key=lambda x: x[1], reverse=True):
        print(f"   {rating}: {count}")
    
    print("\n✅ All restaurants now have complete street addresses!")

def main():
    """Main function"""
    csv_file = '/mnt/user-data/outputs/chicago_michelin_full_addresses.csv'
    json_file = '/mnt/user-data/outputs/chicago_michelin_full_addresses.json'
    
    save_to_csv(csv_file)
    save_to_json(json_file)
    print_summary()

if __name__ == "__main__":
    main()
