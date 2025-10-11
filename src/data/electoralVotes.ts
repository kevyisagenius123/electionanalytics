// Electoral College votes by state (2024 allocation)
// Based on 2020 Census apportionment

export const ELECTORAL_VOTES: Record<string, number> = {
  '01': 9,   // Alabama
  '02': 3,   // Alaska
  '04': 11,  // Arizona
  '05': 6,   // Arkansas
  '06': 54,  // California
  '08': 10,  // Colorado
  '09': 7,   // Connecticut
  '10': 3,   // Delaware
  '11': 3,   // District of Columbia
  '12': 30,  // Florida
  '13': 16,  // Georgia
  '15': 4,   // Hawaii
  '16': 4,   // Idaho
  '17': 19,  // Illinois
  '18': 11,  // Indiana
  '19': 6,   // Iowa
  '20': 6,   // Kansas
  '21': 8,   // Kentucky
  '22': 8,   // Louisiana
  '23': 4,   // Maine
  '24': 10,  // Maryland
  '25': 11,  // Massachusetts
  '26': 15,  // Michigan
  '27': 10,  // Minnesota
  '28': 6,   // Mississippi
  '29': 10,  // Missouri
  '30': 4,   // Montana
  '31': 5,   // Nebraska
  '32': 6,   // Nevada
  '33': 4,   // New Hampshire
  '34': 14,  // New Jersey
  '35': 5,   // New Mexico
  '36': 28,  // New York
  '37': 16,  // North Carolina
  '38': 3,   // North Dakota
  '39': 17,  // Ohio
  '40': 7,   // Oklahoma
  '41': 8,   // Oregon
  '42': 19,  // Pennsylvania
  '44': 4,   // Rhode Island
  '45': 9,   // South Carolina
  '46': 3,   // South Dakota
  '47': 11,  // Tennessee
  '48': 40,  // Texas
  '49': 6,   // Utah
  '50': 3,   // Vermont
  '51': 13,  // Virginia
  '53': 12,  // Washington
  '54': 4,   // West Virginia
  '55': 10,  // Wisconsin
  '56': 3,   // Wyoming
}

export const TOTAL_ELECTORAL_VOTES = 538
export const VOTES_TO_WIN = 270

// State names by FIPS
export const STATE_NAMES: Record<string, string> = {
  '01': 'Alabama',
  '02': 'Alaska',
  '04': 'Arizona',
  '05': 'Arkansas',
  '06': 'California',
  '08': 'Colorado',
  '09': 'Connecticut',
  '10': 'Delaware',
  '11': 'D.C.',
  '12': 'Florida',
  '13': 'Georgia',
  '15': 'Hawaii',
  '16': 'Idaho',
  '17': 'Illinois',
  '18': 'Indiana',
  '19': 'Iowa',
  '20': 'Kansas',
  '21': 'Kentucky',
  '22': 'Louisiana',
  '23': 'Maine',
  '24': 'Maryland',
  '25': 'Massachusetts',
  '26': 'Michigan',
  '27': 'Minnesota',
  '28': 'Mississippi',
  '29': 'Missouri',
  '30': 'Montana',
  '31': 'Nebraska',
  '32': 'Nevada',
  '33': 'New Hampshire',
  '34': 'New Jersey',
  '35': 'New Mexico',
  '36': 'New York',
  '37': 'North Carolina',
  '38': 'North Dakota',
  '39': 'Ohio',
  '40': 'Oklahoma',
  '41': 'Oregon',
  '42': 'Pennsylvania',
  '44': 'Rhode Island',
  '45': 'South Carolina',
  '46': 'South Dakota',
  '47': 'Tennessee',
  '48': 'Texas',
  '49': 'Utah',
  '50': 'Vermont',
  '51': 'Virginia',
  '53': 'Washington',
  '54': 'West Virginia',
  '55': 'Wisconsin',
  '56': 'Wyoming',
}

export const STATE_ABBREVIATIONS: Record<string, string> = {
  '01': 'AL', '02': 'AK', '04': 'AZ', '05': 'AR', '06': 'CA',
  '08': 'CO', '09': 'CT', '10': 'DE', '11': 'DC', '12': 'FL',
  '13': 'GA', '15': 'HI', '16': 'ID', '17': 'IL', '18': 'IN',
  '19': 'IA', '20': 'KS', '21': 'KY', '22': 'LA', '23': 'ME',
  '24': 'MD', '25': 'MA', '26': 'MI', '27': 'MN', '28': 'MS',
  '29': 'MO', '30': 'MT', '31': 'NE', '32': 'NV', '33': 'NH',
  '34': 'NJ', '35': 'NM', '36': 'NY', '37': 'NC', '38': 'ND',
  '39': 'OH', '40': 'OK', '41': 'OR', '42': 'PA', '44': 'RI',
  '45': 'SC', '46': 'SD', '47': 'TN', '48': 'TX', '49': 'UT',
  '50': 'VT', '51': 'VA', '53': 'WA', '54': 'WV', '55': 'WI',
  '56': 'WY',
}
