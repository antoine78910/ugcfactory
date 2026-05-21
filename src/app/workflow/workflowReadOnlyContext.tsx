"use client";

import { createContext, useContext, type ReactNode } from "react";

const WorkflowReadOnlyContext = createContext(false);

export function WorkflowReadOnlyProvider({
  readOnly = false,
  children,
}: {
  readOnly?: boolean;
  children: ReactNode;
}) {
  return <WorkflowReadOnlyContext.Provider value={readOnly}>{children}</WorkflowReadOnlyContext.Provider>;
}

export function useWorkflowReadOnly(): boolean {
  return useContext(WorkflowReadOnlyContext);
}
