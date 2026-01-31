import { createContext } from "react";

export const AlertMessageContext = createContext<string | null>(null);
export const SetAlertMessageContext = createContext<
  React.Dispatch<React.SetStateAction<string | null>>
>(() => {});
