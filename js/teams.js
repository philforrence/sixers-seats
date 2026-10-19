// Opponent metadata: short code, ESPN logo slug, primary color.
const T = {
  'Atlanta Hawks': ['ATL', 'atl', '#E03A3E'],
  'Boston Celtics': ['BOS', 'bos', '#007A33'],
  'Brooklyn Nets': ['BKN', 'bkn', '#3a3a3a'],
  'Charlotte Hornets': ['CHA', 'cha', '#1D1160'],
  'Chicago Bulls': ['CHI', 'chi', '#CE1141'],
  'Cleveland Cavaliers': ['CLE', 'cle', '#860038'],
  'Dallas Mavericks': ['DAL', 'dal', '#00538C'],
  'Denver Nuggets': ['DEN', 'den', '#0E2240'],
  'Detroit Pistons': ['DET', 'det', '#C8102E'],
  'Golden State Warriors': ['GSW', 'gs', '#1D428A'],
  'Houston Rockets': ['HOU', 'hou', '#CE1141'],
  'Indiana Pacers': ['IND', 'ind', '#002D62'],
  'LA Clippers': ['LAC', 'lac', '#C8102E'],
  'Los Angeles Clippers': ['LAC', 'lac', '#C8102E'],
  'Los Angeles Lakers': ['LAL', 'lal', '#552583'],
  'Memphis Grizzlies': ['MEM', 'mem', '#5D76A9'],
  'Miami Heat': ['MIA', 'mia', '#98002E'],
  'Milwaukee Bucks': ['MIL', 'mil', '#00471B'],
  'Minnesota Timberwolves': ['MIN', 'min', '#0C2340'],
  'New Orleans Pelicans': ['NOP', 'no', '#0C2340'],
  'New York Knicks': ['NYK', 'ny', '#F58426'],
  'Oklahoma City Thunder': ['OKC', 'okc', '#007AC1'],
  'Orlando Magic': ['ORL', 'orl', '#0077C0'],
  'Phoenix Suns': ['PHX', 'phx', '#E56020'],
  'Portland Trail Blazers': ['POR', 'por', '#E03A3E'],
  'Sacramento Kings': ['SAC', 'sac', '#5A2D81'],
  'San Antonio Spurs': ['SAS', 'sa', '#6b6b6b'],
  'Toronto Raptors': ['TOR', 'tor', '#CE1141'],
  'Utah Jazz': ['UTA', 'utah', '#002B5C'],
  'Washington Wizards': ['WAS', 'wsh', '#002B5C'],
};

export function team(name) {
  const t = T[name];
  if (!t) return { abbr: (name || '???').slice(0, 3).toUpperCase(), logo: '', color: '#888' };
  return { abbr: t[0], logo: `https://a.espncdn.com/i/teamlogos/nba/500/${t[1]}.png`, color: t[2] };
}

export const TEAM_NAMES = Object.keys(T).filter(n => n !== 'Los Angeles Clippers').sort();
