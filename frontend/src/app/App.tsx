import { RouterProvider } from "react-router";
import { router } from "./routes";
import { AppStateProvider } from "./AppState";
import {WorkspaceFeedback} from '../components/AccountStatus';

export default function App() {
  return (
    <AppStateProvider>
      <div className="device-frame">
        <div className="device-content">
          <WorkspaceFeedback />
          <RouterProvider router={router} />
        </div>
      </div>
    </AppStateProvider>
  );
}
