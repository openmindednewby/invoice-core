export const enum EngagementStepKey {
  Start = 'start',
  Walk = 'walk',
  Requirements = 'requirements',
  ClientReview = 'client-review',
  Answers = 'answers',
  DesignPicks = 'design-picks',
}

export const ENGAGEMENT_STEP_ORDER: readonly EngagementStepKey[] = [
  EngagementStepKey.Start,
  EngagementStepKey.Walk,
  EngagementStepKey.Requirements,
  EngagementStepKey.ClientReview,
  EngagementStepKey.Answers,
  EngagementStepKey.DesignPicks,
];
