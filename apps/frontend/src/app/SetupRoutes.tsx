import { Navigate, Route } from 'react-router-dom';

import { SetupWizard } from '../components/wizard/SetupWizard';

type SetupRoutesProps = {
  onSetupComplete: () => void;
};

export function SetupRoutes({ onSetupComplete }: SetupRoutesProps) {
  return (
    <>
      <Route path="/setup" element={<SetupWizard onSetupComplete={onSetupComplete} />} />
      <Route path="*" element={<Navigate to="/setup" replace />} />
    </>
  );
}
