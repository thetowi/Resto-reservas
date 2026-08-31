import * as signalR from "@microsoft/signalr";
import { getToken } from "./auth";
import { API_URL } from "./api";

export function crearConexion(): signalR.HubConnection {
  return new signalR.HubConnectionBuilder()
    .withUrl(`${API_URL}/hubs/reservas`, {
      accessTokenFactory: () => getToken() ?? "",
    })
    .withAutomaticReconnect()
    .build();
}
