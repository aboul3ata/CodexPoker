# Routine shipping

Optimize the whole path to a healthy live deployment. Normal changes use focused
critical checks and relevant small regressions, one production build, deployment,
and verification of the changed experience in production. Do not run broad test
suites, browser sweeps, evals or duplicate production builds before every PR or
deploy. Production UI verification remains required.

Opt into full validation with the `major-release` PR label or the manual
`major_release` input. Reserve it for deliberate major releases or Ali's request;
breaking contracts, authorization-model changes and irreversible data migrations
need a major-release plan. Routine source, test and dependency edits do not
silently expand into the full suite. Keep security and data-preservation checks
focused and fail clearly if they do not execute.
