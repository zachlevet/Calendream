import { TodayScreen } from '@/features/today/TodayScreen';
// Metro resolves the platform-specific onboarding gate.
// eslint-disable-next-line import/no-unresolved
import { OnboardingGate } from '@/features/onboarding/OnboardingGate';

export default function Index() {
  return <OnboardingGate><TodayScreen /></OnboardingGate>;
}
