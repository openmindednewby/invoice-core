import type { EngagementMode } from './EngagementMode';
import type { EngagementStepKey } from './EngagementStepKey';
import type { StepStatus } from './StepStatus';

export interface EngagementStep {
  key: EngagementStepKey;
  status: StepStatus;
}

export interface Engagement {
  id: string;
  clientId: string;
  name: string;
  mode: EngagementMode;
  steps: EngagementStep[];
  createdAt: string;
}

export interface EngagementInput {
  clientId: string;
  name: string;
  mode: EngagementMode;
}

export interface EngagementOptions {
  now?: () => Date;
  newId?: () => string;
}
