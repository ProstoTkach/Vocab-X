WITH ranked AS (
  SELECT m.cohort_id, m.user_id, c.tier, m.weekly_xp, m.flagged,
         ROW_NUMBER() OVER (PARTITION BY m.cohort_id
           ORDER BY m.weekly_xp DESC, m.active_days DESC, m.reached_at ASC NULLS LAST) AS rn,
         COUNT(*) OVER (PARTITION BY m.cohort_id) AS n
  FROM league_members m JOIN league_cohorts c ON c.id = m.cohort_id
  WHERE m.week_start = $1),
decided AS (
  SELECT cohort_id, user_id, tier, rn,
    CASE WHEN weekly_xp = 0 AND tier > 1 THEN 'demoted'::outcome_t
         WHEN rn <= CEIL(0.2 * n) AND NOT flagged AND weekly_xp > 0
              AND tier < (SELECT max(tier) FROM league_tiers) THEN 'promoted'::outcome_t
         WHEN rn > n - CEIL(0.2 * n) AND tier > 1 THEN 'demoted'::outcome_t
         ELSE 'stayed'::outcome_t END AS outcome
  FROM ranked),
upd AS (
  UPDATE league_members m SET final_rank = d.rn, outcome = d.outcome
  FROM decided d WHERE m.cohort_id = d.cohort_id AND m.user_id = d.user_id
  RETURNING m.user_id, d.outcome, d.tier)
UPDATE profiles p
SET league_tier = u.tier + CASE u.outcome WHEN 'promoted' THEN 1 WHEN 'demoted' THEN -1 ELSE 0 END
FROM upd u WHERE p.user_id = u.user_id;
