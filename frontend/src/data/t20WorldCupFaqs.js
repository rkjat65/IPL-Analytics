export const T20WC_FAQ_CATEGORIES = [
  {
    category: 'About the Tournament',
    items: [
      { q: "What is the ICC Men's T20 World Cup?", a: "It is the ICC's global championship for men's Twenty20 international cricket, contested by national teams." },
      { q: 'How is T20 World Cup cricket different from the IPL?', a: 'The T20 World Cup is an international tournament between national teams. The IPL is a franchise league played by city-based teams.' },
      { q: 'What does an edition mean?', a: 'An edition is one staging of the tournament. Crickrida lets you filter World Cup analysis by edition year.' },
      { q: 'Why do editions have multiple points tables?', a: 'World Cup formats can include more than one group or stage. Crickrida keeps each group table separate so teams from unrelated groups are not combined.' },
    ],
  },
  {
    category: 'Data and Analytics',
    items: [
      { q: 'What World Cup data is available here?', a: 'The World Cup mode includes match results, detailed scorecards, ball-by-ball records, team and player profiles, venue analysis, phases, partnerships and head-to-head records.' },
      { q: 'Are IPL and T20 World Cup statistics combined?', a: 'No. Each mode uses an isolated database, and every API request is scoped to the selected tournament.' },
      { q: 'How are batting records calculated?', a: 'Batting records are calculated directly from delivery-level data, including runs, balls faced, boundaries, averages and strike rates.' },
      { q: 'How are bowling records calculated?', a: 'Bowling records use delivery-level wickets, legal balls and runs conceded to calculate totals, averages, economy rates and strike rates.' },
      { q: 'Are Super Overs included in career records?', a: 'Standard career and tournament records exclude Super Over deliveries unless a page explicitly identifies Super Over analysis.' },
    ],
  },
  {
    category: 'Using World Cup Mode',
    items: [
      { q: 'How do I switch back to IPL?', a: 'Use the IPL and T20 World Cup selector beside the Crickrida branding. Your selection is preserved while you navigate.' },
      { q: 'Can I share a World Cup page?', a: 'Yes. The selected tournament is stored in the page URL, so shared links open with the same tournament context.' },
      { q: 'Can I compare two national teams?', a: 'Yes. Open Head-to-Head in T20 World Cup mode and select any two teams available in the database.' },
      { q: 'Can I filter statistics by edition?', a: 'Yes. Dashboard, batting, bowling, matches and insight pages support edition filters in World Cup mode.' },
    ],
  },
]

export const T20WC_FAQ_FLAT = T20WC_FAQ_CATEGORIES.flatMap((category) => category.items)
