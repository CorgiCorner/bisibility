import { expect, type Page, test } from "@playwright/test";
import { testAndSaveDataForSeo } from "./workspace";

test("provider setup recovers when an enabled test button remounts disabled before click", async ({
  page,
}) => {
  test.setTimeout(20_000);
  await page.setContent(`
    <html data-hydrated="true"><body>
      <label>API login<input id="login" oninput="updateTestButton()"></label>
      <label>API password<input id="password" oninput="updateTestButton()"></label>
      <div role="status"></div>
      <button id="test" disabled onclick="verifyProvider()">Test connection</button>
      <button id="save" disabled onclick="saveProvider()">Save connection</button>
      <button id="continue" disabled>Continue</button>
      <script>
        function updateTestButton() {
          document.getElementById("test").disabled =
            !document.getElementById("login").value || !document.getElementById("password").value;
        }
        function verifyProvider() {
          document.querySelector('[role="status"]').textContent = "DataForSEO verified";
          document.getElementById("save").disabled = false;
        }
        function saveProvider() {
          document.querySelector('[role="status"]').textContent = "DataForSEO connected";
          document.getElementById("continue").disabled = false;
        }
      </script>
    </body></html>
  `);

  let clicks = 0;
  // Inject the observed remount at the assertion/action boundary. All locator
  // actionability waits, clicks, refills and resulting statuses use the real browser.
  const remountingPage = new Proxy(page, {
    get(target, property) {
      if (property === "getByRole") {
        return (...args: Parameters<Page["getByRole"]>) => {
          const locator = target.getByRole(...args);
          if (args[0] === "button" && args[1]?.name === "Test connection") {
            const click = locator.click.bind(locator);
            locator.click = async (options) => {
              clicks += 1;
              if (clicks === 1) {
                await target.evaluate(() => {
                  for (const id of ["login", "password"]) {
                    (document.getElementById(id) as HTMLInputElement).value = "";
                  }
                  const button = document.getElementById("test") as HTMLButtonElement;
                  const replacement = button.cloneNode(true) as HTMLButtonElement;
                  replacement.disabled = true;
                  button.replaceWith(replacement);
                });
              }
              return click(options);
            };
          }
          return locator;
        };
      }
      const value = Reflect.get(target, property);
      return typeof value === "function" ? value.bind(target) : value;
    },
  });

  await testAndSaveDataForSeo(remountingPage);
  expect(clicks).toBe(2);
  await expect(page.getByRole("status")).toHaveText("DataForSEO connected");
  await expect(page.getByRole("button", { name: "Continue", exact: true })).toBeEnabled();
});
