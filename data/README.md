# Datasets go here

Copy the two files from the course template (`triage-base`) / Teams into this folder:

- `support_tickets_500.json` (or `.csv`): the 500 unlabelled tickets
- the labelled 100-ticket file: any `.json` / `.csv` whose name contains `label`
  (e.g. `support_tickets_labelled_100.json`). It must have `category` and `priority` fields
  (`expected_category` / `expected_priority`, `gold_*`, `label_*` are also recognised).

`runs.json` (smoke test log) is created here automatically.
