# Live Prediction Suggestions — Design Spec

## Overview

Make the prediction suggestion list update in real-time as the user types in the todo input field. The list sits below the input (autocomplete-style), shows blended predictions when the input is empty, and filters to matching patterns while typing.

## Component Architecture

```
page.tsx
  ├── state: inputValue (string)
  ├── debouncedQuery: 300ms debounce of inputValue
  │
  ├── TodoForm
  │     props: onSubmit, onInputChange → updates inputValue
  │     calls onInputChange on every keystroke
  │
  ├── div.suggestions-container
  │     └── PredictionList
  │           props: query (debouncedQuery)
  │           SWR: GET /api/predictions?query=...
  │           renders: suggestion buttons or hint text
  │
  └── TodoList (unchanged)
```

page.tsx owns the input state; TodoForm and PredictionList are siblings below a wrapping div.

## UI Layout

```
┌────────────────────────────────┐
│  TODO App                  [logout] │
│  [input_____________________]  │
│  ┌ Suggestions ─────────────┐  │
│  │ buy milk           0.42  │  │  ← empty input: blended predictions
│  │ buy bread          0.31  │  │  ← typing: substring/token matches
│  │ No matching suggestions  │  │  ← no matches found
│  └──────────────────────────┘  │
│  [list of todos...]            │
└────────────────────────────────┘
```

- Suggestions render below the input, full width
- Always visible (both when input is focused and not)
- Hint text when no patterns exist or no matches found

## API & Service

### Endpoint

`GET /api/predictions?query=` (new optional param)

No new endpoint — the existing GET /api/predictions route is extended.

### Query flow

When `query` is provided (non-empty string):
1. Normalize with `patternService.normalizeTitle(query)` → terms + stemmed terms
2. Fetch all patterns via `patternRepository.getAllPatterns(userId)`
3. Filter: keep patterns where the title or normalized terms have ANY overlap with query terms (substring match on title OR non-empty Set intersection of normalized tokens)
4. Score each match: `overlapCount * 2 + pattern.frequency * 1`
5. Sort by score desc, return top 5

When `query` is empty/absent:
- Existing behavior: temporal (0.3) + sequential (0.4) + semantic (0.3) blended top 3

### Substring/token overlap matching

```
query: "mil"
  → normalized: { terms: ["mil"], stemmedTerms: ["mil"] }
  → matches: "buy milk" (substring), "milk delivery" (substring)
  → no match: "buy bread" (no overlap)

query: "buy bre"
  → normalized: { terms: ["buy", "bre"], stemmedTerms: ["buy", "bre"] }
  → matches: "buy bread" (token "buy" + substring "bre"), "buy milk" (token "buy")
  → "buy bread" scores higher (2 overlapping tokens)
```

## Debounce & Mutation

- **300ms debounce** in page.tsx via useEffect + setTimeout/clearTimeout
- SWR dedup handles rapid keystrokes (only the final value triggers a fetch)

After a suggestion is clicked and todo is created:
- `mutate('/api/todos')` (existing)
- `mutate('/api/predictions')` (new — keeps suggestions fresh)

## Empty States

| Condition | Rendered UI |
|-----------|------------|
| No patterns exist at all | "Create a few todos to see suggestions" |
| Query has no matches | "No matching suggestions" |
| Query has matches | Top 5 suggestions, scored by overlap + frequency |
| Input empty, patterns exist | Top 3 blended predictions (temporal + sequential + semantic) |

## Click Behavior

Clicking a suggestion calls `handleCreate(p.rawTitle)` — creates the todo immediately with the suggestion's title. Same behavior as before.

## Files Changed

| File | Change |
|------|--------|
| `components/TodoForm.tsx` | Accept `onInputChange` prop, call on every keystroke |
| `app/page.tsx` | Add `inputValue` state + 300ms debounce; pass `onInputChange` + `debouncedQuery`; add `mutate('/api/predictions')` in handleCreate; move PredictionList below TodoForm |
| `components/PredictionList.tsx` | Accept `query` prop; pass as SWR param; add empty state rendering; remove sidebar layout classes |
| `lib/services/prediction.service.ts` | Add `query` handling to `predict()` — substring/token matching when query present |
| `app/api/predictions/route.ts` | Parse `query` from searchParams, pass to predictionService.predict() |
