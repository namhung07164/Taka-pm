import { useMemo } from "react";
import { useAppStore } from "../store/useAppStore";
import { getUserAllowedStores } from "../lib/utils";
import { useProjectsHydration } from "./useFirebaseDataParts/useProjectsHydration";
import { useTasksHydration } from "./useFirebaseDataParts/useTasksHydration";
import { useCostsHydration } from "./useFirebaseDataParts/useCostsHydration";
import { useDelegationsHydration } from "./useFirebaseDataParts/useDelegationsHydration";
import { useStaticAndAuthHydration } from "./useFirebaseDataParts/useStaticAndAuthHydration";

export function useFirebaseData() {
  const user = useAppStore((state) => state.user);
  const currentUser = useAppStore((state) => state.currentUser);

  const userCanSee = currentUser?.role === "admin" || !!currentUser?.canSee;
  const userRole = currentUser?.role;

  const allowedStores = useMemo(
    () => getUserAllowedStores(currentUser),
    [currentUser]
  );

  // Stable Query Signature
  const querySignature = useMemo(() => {
    if (!user?.uid || !userCanSee) return null;
    return `${user.uid}_${userRole}_${allowedStores.slice().sort().join("-")}`;
  }, [user?.uid, userCanSee, userRole, allowedStores]);

  // Sub-hook 1: Auth, Static Configs, Offline Queue & Sleep/Wake Guard
  useStaticAndAuthHydration();

  // Sub-hook 2: Projects Delta Sync & Local Hydration
  useProjectsHydration({ querySignature, userRole, allowedStores });

  // Sub-hook 3: Tasks Delta Sync & Local Hydration
  useTasksHydration({ querySignature, userRole, allowedStores });

  // Sub-hook 4: Costs Delta Sync & Local Hydration
  useCostsHydration({ querySignature, userRole, allowedStores });

  // Sub-hook 5: Delegation Groups Delta Sync & Local Hydration
  useDelegationsHydration({ querySignature, userRole, allowedStores });
}
