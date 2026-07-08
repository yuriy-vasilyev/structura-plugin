<?php
/**
 * `Campaign_Repository` was retired and physically deleted from the
 * codebase on 2026-05-01 as part of the v2 "cloud is the single
 * source of truth" cleanup. The previous integration test suite
 * (~300 lines of `_cluster_*` post-meta round-trip assertions) is
 * obsolete — campaigns now live on cloud Firestore and are read via
 * `Campaign_Cloud_Reader::get_campaign_data()`.
 *
 * This file is kept as a tombstone so a future `git log` lookup for
 * "where did CampaignRepositoryTest go" lands on this comment, then
 * can delete the file outright. Memory:
 * `feedback_cloud_is_single_source_of_truth_v2`.
 */
