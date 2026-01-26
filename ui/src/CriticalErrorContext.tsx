import { createContext } from "react";

export const CriticalErrorContext = createContext<string | null>(null);
export const SetCriticalErrorContext = createContext<
  React.Dispatch<React.SetStateAction<string | null>>
>(() => {});
