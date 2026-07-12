// Phase A: only the config this echo-stage server actually needs. Claude/DB/
// Twilio env vars get validated here once Phase C actually wires them in --
// no point failing boot on secrets nothing reads yet.
export const config = {
  port: Number(process.env.PORT ?? 8080),
};
