"use client";

import { createContext, useContext, type ReactNode } from "react";

type WorkflowReadOnlyContextValue = {
  readOnly: boolean;
  hidePromptsForGuests: boolean;
};

const WorkflowReadOnlyContext = createContext<WorkflowReadOnlyContextValue>({
  readOnly: false,
  hidePromptsForGuests: false,
});

export function WorkflowReadOnlyProvider({
  readOnly = false,
  hidePromptsForGuests = false,
  children,
}: {
  readOnly?: boolean;
  hidePromptsForGuests?: boolean;
  children: ReactNode;
}) {
  return (
    <WorkflowReadOnlyContext.Provider value={{ readOnly, hidePromptsForGuests }}>
      {children}
    </WorkflowReadOnlyContext.Provider>
  );
}

export function useWorkflowReadOnly(): boolean {
  return useContext(WorkflowReadOnlyContext).readOnly;
}

/** Blur prompt fields for signed-out viewers on public links. */
export function useWorkflowGuestPromptGate(): boolean {
  return useContext(WorkflowReadOnlyContext).hidePromptsForGuests;
}
