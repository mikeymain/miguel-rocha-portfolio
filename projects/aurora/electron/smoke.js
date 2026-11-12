import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export async function nativeSmoke({ mainWindow, handle, getAlarmWindow, getState, tick }) {
  const start = new Date();
  start.setDate(start.getDate() + 1);
  start.setHours(10, 0, 0, 0);
  await handle({
    type: "saveEvent",
    item: {
      id: "smoke-event",
      title: "Smoke test appointment",
      start: start.toISOString(),
      end: new Date(+start + 3600000).toISOString(),
      repeat: "none",
      category: "work",
      reminder: 10,
    },
  });
  if (getState().events.length !== 1)
    throw new Error("Event did not persist through the desktop handler.");
  mainWindow.close();
  if (mainWindow.isDestroyed() || mainWindow.isVisible())
    throw new Error("Closing the main window did not keep the tray process alive.");
  const due = new Date(Date.now() - 2000);
  await handle({
    type: "saveAlarm",
    item: {
      id: "smoke-alarm",
      title: "Background alarm test",
      start: due.toISOString(),
      repeat: "none",
      enabled: true,
      sound: "silent",
    },
  });
  const alarm = getAlarmWindow();
  if (!alarm) throw new Error("A due alarm did not open its window after the main window closed.");
  if (alarm.webContents.isLoading())
    await new Promise((resolve) => alarm.webContents.once("did-finish-load", resolve));
  const key = Object.keys(getState().alarmState).find(
    (key) => getState().alarmState[key].itemId === "smoke-alarm",
  );
  await handle({ type: "snooze", key, minutes: 5 });
  if (getAlarmWindow()) throw new Error("Snoozing did not close the ringing window.");
  await handle({ type: "deleteAlarm", id: "smoke-alarm" });
  await handle({ type: "deleteEvent", id: "smoke-event" });
  tick();
  if (process.argv.includes("--capture")) {
    const output = join(process.cwd(), ".impeccable/review");
    mkdirSync(output, { recursive: true });
    await mainWindow.webContents.executeJavaScript("document.fonts.ready.then(()=>true)");
    mainWindow.setMinimumSize(360, 600);
    for (const [name, width, height] of [
      ["desktop", 1440, 900],
      ["tablet", 768, 1024],
      ["mobile", 390, 844],
    ]) {
      mainWindow.setContentSize(width, height);
      await delay(350);
      const screenshot = await mainWindow.webContents.capturePage();
      writeFileSync(join(output, `${name}.png`), screenshot.toPNG());
    }
    mainWindow.setContentSize(1440, 900);
    for (const [index, title, category] of [
      [0, "Sample: plan the week", "work"],
      [1, "Sample: lunch break", "personal"],
      [2, "Sample: dinner reservation", "email"],
    ]) {
      const sample = new Date();
      sample.setHours(10 + index * 3, 0, 0, 0);
      await handle({
        type: "saveEvent",
        item: {
          id: `sample-${index}`,
          title,
          start: sample.toISOString(),
          end: new Date(+sample + 3600000).toISOString(),
          repeat: "none",
          category,
          reminder: null,
          location: index === 1 ? "At home" : "",
        },
      });
    }
    const birthdayDate = new Date();
    await handle({
      type: "importBirthdays",
      text: `BEGIN:VCARD\r\nVERSION:3.0\r\nUID:sample-birthday\r\nFN:Sample: Jamie\r\nBDAY:1992-${String(birthdayDate.getMonth() + 1).padStart(2, "0")}-${String(birthdayDate.getDate()).padStart(2, "0")}\r\nEND:VCARD`,
    });
    await delay(350);
    writeFileSync(
      join(output, "populated-desktop.png"),
      (await mainWindow.webContents.capturePage()).toPNG(),
    );
    await handle({ type: "settings", settings: { theme: "dark" } });
    for (let tries = 0; tries < 30; tries++) {
      if (
        (await mainWindow.webContents.executeJavaScript(
          "document.documentElement.dataset.theme",
        )) === "dark"
      )
        break;
      await delay(100);
    }
    if (
      (await mainWindow.webContents.executeJavaScript("document.documentElement.dataset.theme")) !==
      "dark"
    )
      throw new Error("Dark theme did not render.");
    await delay(1000);
    console.log(
      JSON.stringify({
        darkTheme: await mainWindow.webContents.executeJavaScript(
          "({theme:document.documentElement.dataset.theme,ink:getComputedStyle(document.documentElement).getPropertyValue('--ink'),dayColor:getComputedStyle(document.querySelector('.day-number')).color,button:getComputedStyle(document.querySelector('.sidebar-create')).backgroundColor})",
        ),
      }),
    );
    writeFileSync(
      join(output, "dark.png"),
      (
        await mainWindow.webContents.capturePage(undefined, { stayHidden: true, stayAwake: true })
      ).toPNG(),
    );
    await handle({ type: "settings", settings: { theme: "light" } });
    for (let tries = 0; tries < 30; tries++) {
      if (
        (await mainWindow.webContents.executeJavaScript(
          "document.documentElement.dataset.theme",
        )) === "light"
      )
        break;
      await delay(100);
    }
    mainWindow.setContentSize(390, 844);
    await delay(250);
    writeFileSync(
      join(output, "populated-mobile.png"),
      (await mainWindow.webContents.capturePage()).toPNG(),
    );
    mainWindow.setContentSize(1440, 900);
    await handle({
      type: "saveAlarm",
      item: {
        id: "sample-alarm",
        title: "Sample: take a break",
        start: start.toISOString(),
        repeat: "weekdays",
        enabled: true,
        sound: "bell",
      },
    });
    await handle({
      type: "importText",
      mail: {
        sourceId: "sample-email",
        subject: "Sample: dinner reservation",
        text: "Your dinner booking is confirmed for November 12, 2026 at 7pm.",
      },
    });
    const pageFile = join(process.cwd(), "dist/index.html");
    for (const [page, heading] of [
      ["alarms", "Alarms"],
      ["inbox", "Email events"],
      ["accounts", "Accounts"],
      ["settings", "Settings"],
    ]) {
      await mainWindow.loadFile(pageFile, { hash: page });
      await mainWindow.webContents.executeJavaScript("document.fonts.ready.then(()=>true)");
      await delay(200);
      const actual = await mainWindow.webContents.executeJavaScript(
        'document.querySelector("main h1")?.textContent',
      );
      if (actual !== heading) throw new Error(`The ${page} screen did not render (got ${actual}).`);
      writeFileSync(
        join(output, `${page}.png`),
        (await mainWindow.webContents.capturePage()).toPNG(),
      );
    }
    await mainWindow.loadFile(pageFile);
    await delay(200);
    for (let i = 0; i < 3; i++) await handle({ type: "deleteEvent", id: `sample-${i}` });
    await handle({ type: "deleteEvent", id: "birthday:sample-birthday" });
    await handle({ type: "deleteAlarm", id: "sample-alarm" });
    writeFileSync(
      join(output, "captures.json"),
      JSON.stringify(
        {
          source: "native Electron app from production build",
          fixtures:
            "Populated calendar, alarm and inbox captures contain clearly named Sample entries. No real account connected.",
          viewports: { desktop: [1440, 900], tablet: [768, 1024], mobile: [390, 844] },
          capturedAt: new Date().toISOString(),
        },
        null,
        2,
      ),
    );
    console.log(
      JSON.stringify({
        screenshots: output,
        trayLifetime: true,
        backgroundAlarm: true,
        snooze: true,
      }),
    );
  }
}
