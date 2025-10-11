// Generate placeholder GeoJSON for Quebec 1995 ridings
// This creates a simple grid of rectangles to represent ridings
// until we can find the actual 1995 boundaries

const fs = require('fs');

// List of 125 ridings from the CSV
const ridings = [
  "Abitibi-Est", "Abitibi-Ouest", "Acadie", "Anjou", "Argenteuil",
  "Arthabaska", "Beauce-Nord", "Beauce-Sud", "Beauharnois-Huntingdon",
  "Bellechasse", "Berthier", "Bertrand", "Blainville", "Bonaventure",
  "Borduas", "Bourassa", "Bourget", "Brome-Missisquoi", "Chambly",
  "Champlain", "Chapleau", "Charlesbourg", "Charlevoix", "Châteauguay",
  "Chauveau", "Chicoutimi", "Chomedey", "Chutes-de-la-Chaudière",
  "Crémazie", "D'Arcy-McGee", "Deux-Montagnes", "Drummond", "Dubuc",
  "Duplessis", "Fabre", "Frontenac", "Gaspé", "Gatineau", "Gouin",
  "Groulx", "Hochelaga-Maisonneuve", "Hull", "Iberville", "Îles-de-la-Madeleine",
  "Jacques-Cartier", "Jean-Talon", "Jeanne-Mance", "Johnson", "Joliette",
  "Jonquière", "Kamouraska-Témiscouata", "Labelle", "Lac-Saint-Jean",
  "LaFontaine", "La Peltrie", "Laprairie", "La Pinière", "Laporte",
  "L'Assomption", "Laurier-Dorion", "Laval-des-Rapides", "Laviolette",
  "Lévis", "Limoilou", "Lotbinière", "Louis-Hébert", "Masson",
  "Maskinongé", "Matapédia", "Matane", "Mégantic-Compton", "Mercier",
  "Mille-Îles", "Montmagny-L'Islet", "Montmorency", "Mont-Royal",
  "Nelligan", "Nicolet-Yamaska", "Notre-Dame-de-Grâce", "Orford",
  "Outremont", "Papineau", "Pointe-aux-Trembles", "Pontiac", "Portneuf",
  "Prévost", "René-Lévesque", "Richelieu", "Richmond", "Rimouski",
  "Robert-Baldwin", "Roberval", "Rosemont", "Rousseau", "Rouyn-Noranda--Témiscamingue",
  "Saguenay", "Saint-François", "Saint-Henri--Sainte-Anne", "Saint-Hyacinthe",
  "Saint-Jean", "Saint-Laurent", "Saint-Louis", "Saint-Maurice", "Sainte-Marie--Saint-Jacques",
  "Salaberry-Soulanges", "Shefford", "Sherbrooke", "Taillon", "Taschereau",
  "Terrebonne", "Ungava", "Vanier", "Vaudreuil", "Vercères",
  "Verchères", "Verdun", "Viau", "Viger", "Vimont",
  "Westmount--Saint-Louis", "Anjou-Rivière-des-Prairies", "Beauce-Sud",
  "La Prairie", "L'Assomption", "Laval-des-Rapides", "Marguerite-Bourgeoys",
  "Marquette", "Nelligan", "Robert-Baldwin", "Westmount-Saint-Louis"
];

// Create a grid layout in Quebec's approximate lat/long bounds
// Quebec roughly: 45°N to 62°N, -79°W to -57°W
const minLat = 45;
const maxLat = 55;
const minLon = -79;
const maxLon = -57;

const cols = 10;
const rows = Math.ceil(125 / cols);

const cellWidth = (maxLon - minLon) / cols;
const cellHeight = (maxLat - minLat) / rows;

const features = [];

for (let i = 0; i < Math.min(ridings.length, 125); i++) {
  const row = Math.floor(i / cols);
  const col = i % cols;
  
  const lon1 = minLon + col * cellWidth;
  const lon2 = lon1 + cellWidth;
  const lat1 = minLat + row * cellHeight;
  const lat2 = lat1 + cellHeight;
  
  features.push({
    type: "Feature",
    properties: {
      name: ridings[i],
      NAME: ridings[i],
      circonscription: ridings[i]
    },
    geometry: {
      type: "Polygon",
      coordinates: [[
        [lon1, lat1],
        [lon2, lat1],
        [lon2, lat2],
        [lon1, lat2],
        [lon1, lat1]
      ]]
    }
  });
}

const geojson = {
  type: "FeatureCollection",
  features: features
};

const outputPath = '../public/data/quebec_1995_placeholder.geojson';
fs.writeFileSync(outputPath, JSON.stringify(geojson, null, 2));
console.log(`Created placeholder GeoJSON with ${features.length} ridings at ${outputPath}`);
