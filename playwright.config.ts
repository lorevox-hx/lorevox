import { defineConfig } from "@playwright/test";

const BASE_URL = process.env.LOREVOX_BASE_URL || "http://127.0.0.1:8000";
const isCI     = !!process.env.CI;

/**
 * webServer block — uses scripts/start-lorevox-audit.sh so the startup chain
 * is easy to tweak without touching this file.
 *
 * Override environment variables as needed:
 *   export LOREVOX_REPO=/mnt/c/Users/chris/lorevox
 *   export LOREVOX_VENV=/mnt/c/Users/chris/lorevox/.venv-gpu
 *   export DATA_DIR=/home/chris/lorevox_data
 *   export USE_TTS=0
 *
 * reuseExistingServer: true means the tests run against a server you already
 * started manually — the script is only invoked if port 8000 is not up yet.
 */
export default defineConfig({
  testDir: "./tests/e2e",
  timeout: 60_000,
  expect: {
    timeout: 10_000,
  },
  fullyParallel: false,
  forbidOnly: isCI,
  retries:    isCI ? 1 : 0,
  workers:    isCI ? 1 : undefined,

  reporter: [
    ["list"],
    ["html", { open: "never" }],
  ],

  use: {
    baseURL:    BASE_URL,
    headless:   true,
    trace:      "retain-on-failure",
    screenshot: "only-on-failure",
    video:      "retain-on-failure",
  },

  webServer: {
    command: "bash scripts/start-lorevox-audit.sh",
    url:     `${BASE_URL}/openapi.json`,
    reuseExistingServer: true,
    timeout: 120_000,
    stdout:  "pipe",
    stderr:  "pipe",
    env: {
      ...process.env,
      PYTHONUNBUFFERED: "1",
      DATA_DIR:      process.env.DATA_DIR      || "/home/chris/lorevox_data",
      USE_TTS:       process.env.USE_TTS       || "0",
      LOREVOX_REPO:  process.env.LOREVOX_REPO  || "/mnt/c/Users/chris/lorevox",
      LOREVOX_VENV:  process.env.LOREVOX_VENV  || "/mnt/c/Users/chris/lorevox/.venv-gpu",
    },
  },
});
