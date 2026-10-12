import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import { setTimeout } from "node:timers/promises";
import { promisify } from "node:util";

const run = promisify(execFile);

/** Owns only this named fixture container and its anonymous volume. */
export async function disposablePostgres() {
  const name = `metering-restart-${randomUUID()}`;
  const docker = (...args: string[]) => run("docker", args);
  const ready = async () => {
    for (let attempt = 0; attempt < 100; attempt++) {
      try {
        await docker("exec", name, "pg_isready", "-h", "127.0.0.1", "-U", "postgres");
        return;
      } catch {
        await setTimeout(100);
      }
    }
    throw new Error("Disposable PostgreSQL did not become ready");
  };
  const close = () => docker("rm", "--force", "--volumes", name).then(() => {});
  try {
    await docker(
      "run",
      "--detach",
      "--name",
      name,
      "--env",
      "POSTGRES_HOST_AUTH_METHOD=trust",
      "--publish",
      "127.0.0.1::5432",
      "--entrypoint",
      "sh",
      "postgres:17-alpine",
      "-c",
      "docker-entrypoint.sh postgres & sleep infinity",
    );
    await ready();
    const { stdout } = await docker("port", name, "5432/tcp");
    const port = stdout.trim().split(":").at(-1);
    return {
      url: `postgresql://postgres@127.0.0.1:${port}/postgres`,
      async restart() {
        await docker(
          "exec",
          "--user",
          "postgres",
          name,
          "pg_ctl",
          "-D",
          "/var/lib/postgresql/data",
          "-w",
          "stop",
          "-m",
          "immediate",
        );
        await docker(
          "exec",
          "--user",
          "postgres",
          name,
          "pg_ctl",
          "-D",
          "/var/lib/postgresql/data",
          "-w",
          "-l",
          "/tmp/restart.log",
          "start",
        );
        await ready();
      },
      async dump(schema: string) {
        return (await docker("exec", name, "pg_dump", "-U", "postgres", "--schema", schema)).stdout;
      },
      async restore(sql: string) {
        await new Promise<void>((resolve, reject) => {
          const child = execFile(
            "docker",
            ["exec", "--interactive", name, "psql", "-U", "postgres", "--set", "ON_ERROR_STOP=1"],
            (error) => (error ? reject(error) : resolve()),
          );
          child.stdin?.end(sql);
        });
      },
      close,
    };
  } catch (error) {
    await close();
    throw error;
  }
}
