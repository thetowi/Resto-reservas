import * as signalR from "@microsoft/signalr";
import { API_URL, tokenVigente } from "./api";

export function crearConexion(): signalR.HubConnection {
  return new signalR.HubConnectionBuilder()
    .withUrl(`${API_URL}/hubs/reservas`, {
      // Con «Recordarme» el token se renueva antes de reconectar.
      accessTokenFactory: async () => (await tokenVigente()) ?? "",
    })
    .withAutomaticReconnect()
    .build();
}
