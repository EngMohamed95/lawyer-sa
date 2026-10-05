/* Run with Firestore + Storage emulators, never production:
 * firebase emulators:exec --project demo-lawyer-support --only firestore,storage "node scripts/verify-support.cjs"
 * Dev test dependencies: @firebase/rules-unit-testing@4, firebase@11.
 */
const {
  initializeTestEnvironment,
  assertSucceeds,
  assertFails,
} = require("@firebase/rules-unit-testing");
const testRequire = require("module").createRequire(
  require.resolve("@firebase/rules-unit-testing"),
);
const {
  doc,
  collection,
  setDoc,
  getDoc,
  getDocs,
  updateDoc,
  deleteDoc,
  query,
  where,
  limit,
  orderBy,
  startAfter,
  serverTimestamp,
  writeBatch,
  increment,
} = testRequire("firebase/firestore");
const { ref, uploadBytes, getBytes } = testRequire("firebase/storage");
const fs = require("fs");
const assert = require("node:assert/strict");

(async () => {
  const env = await initializeTestEnvironment({
    projectId: "demo-lawyer-support",
    firestore: {
      host: "127.0.0.1",
      port: 8088,
      rules: fs.readFileSync("firestore.rules", "utf8"),
    },
    storage: {
      host: "127.0.0.1",
      port: 9198,
      rules: fs.readFileSync("storage.rules", "utf8"),
    },
  });
  let checks = 0;
  const pass = async (name, work) => {
    await work();
    checks++;
    console.log(`PASS ${name}`);
  };
  const owner = env.authenticatedContext("owner"),
    admin = env.authenticatedContext("admin"),
    coworker = env.authenticatedContext("coworker"),
    other = env.authenticatedContext("other"),
    suspended = env.authenticatedContext("suspended");
  const db = owner.firestore(),
    adb = admin.firestore();
  const ticketData = () => ({
    subject: "Support test",
    description: "A reproducible technical issue.",
    category: "مشكلة تقنية أو عطل في النظام",
    priority: "NORMAL",
    status: "OPEN",
    createdBy: "owner",
    requesterName: "Test owner",
    lawyerId: "office-a",
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    lastMessageId: "",
    lastReplyBy: "",
    messageCount: 1,
    attachments: [],
  });
  const ticket = (db, id = "ticket-test") => doc(db, "supportTickets", id);
  async function reply(db, uid, isAdmin, body, id = "ticket-test") {
    const mr = doc(collection(ticket(db, id), "messages"));
    const tx = writeBatch(db);
    tx.set(mr, {
      body,
      senderId: uid,
      senderName: uid,
      isAdmin,
      createdAt: serverTimestamp(),
      attachments: [],
    });
    tx.update(ticket(db, id), {
      lastMessageId: mr.id,
      lastReplyBy: isAdmin ? "ADMIN" : "USER",
      status: isAdmin ? "WAITING" : "OPEN",
      updatedAt: serverTimestamp(),
      messageCount: increment(1),
    });
    await tx.commit();
  }
  try {
    await env.clearFirestore();
    await env.withSecurityRulesDisabled(async (context) => {
      for (const [uid, role, office, status] of [
        ["owner", "LAWYER", "office-a", "ACTIVE"],
        ["admin", "SUPER_ADMIN", "admin", "ACTIVE"],
        ["coworker", "OFFICE_LAWYER", "office-a", "ACTIVE"],
        ["other", "LAWYER", "office-b", "ACTIVE"],
        ["suspended", "LAWYER", "office-c", "SUSPENDED"],
      ])
        await setDoc(doc(context.firestore(), "users", uid), {
          name: uid,
          role,
          lawyerId: office,
          status,
        });
    });
    await pass("owner creates a ticket", () =>
      assertSucceeds(setDoc(ticket(db), ticketData())),
    );
    await pass("owner cannot promote self to platform admin", () =>
      assertFails(
        updateDoc(doc(db, "users", "owner"), { role: "SUPER_ADMIN" }),
      ),
    );
    await pass("owner cannot create platform admin", () =>
      assertFails(
        setDoc(doc(db, "users", "fake-admin"), {
          role: "SUPER_ADMIN",
          lawyerId: "office-a",
        }),
      ),
    );
    await pass("anonymous cannot read", () =>
      assertFails(getDoc(ticket(env.unauthenticatedContext().firestore()))),
    );
    await pass("another office cannot read", () =>
      assertFails(getDoc(ticket(other.firestore()))),
    );
    await pass("coworker in same office cannot read private support", () =>
      assertFails(getDoc(ticket(coworker.firestore()))),
    );
    await pass("admin can read", () => assertSucceeds(getDoc(ticket(adb))));
    await pass("owner query succeeds with identity filter", () =>
      assertSucceeds(
        getDocs(
          query(
            collection(db, "supportTickets"),
            where("createdBy", "==", "owner"),
            orderBy("createdAt", "desc"),
            limit(11),
          ),
        ),
      ),
    );
    await pass("unscoped user query denied", () =>
      assertFails(getDocs(collection(db, "supportTickets"))),
    );
    await pass("cannot forge creator", () =>
      assertFails(
        setDoc(ticket(db, "forged"), { ...ticketData(), createdBy: "other" }),
      ),
    );
    await pass("cannot forge office", () =>
      assertFails(
        setDoc(ticket(db, "forged-office"), {
          ...ticketData(),
          lawyerId: "office-b",
        }),
      ),
    );
    await pass("suspended user denied", () =>
      assertFails(
        setDoc(ticket(suspended.firestore(), "suspended"), {
          ...ticketData(),
          createdBy: "suspended",
          lawyerId: "office-c",
        }),
      ),
    );
    await pass("reject invalid category", () =>
      assertFails(
        setDoc(ticket(db, "bad-category"), {
          ...ticketData(),
          category: "invalid",
        }),
      ),
    );
    await pass("reject oversized subject", () =>
      assertFails(
        setDoc(ticket(db, "long"), {
          ...ticketData(),
          subject: "x".repeat(201),
        }),
      ),
    );
    await pass("reject oversized description", () =>
      assertFails(
        setDoc(ticket(db, "long-description"), {
          ...ticketData(),
          description: "x".repeat(3001),
        }),
      ),
    );
    await pass("owner cannot change identity", () =>
      assertFails(
        updateDoc(ticket(db), {
          createdBy: "other",
          updatedAt: serverTimestamp(),
        }),
      ),
    );
    await pass("owner cannot mark resolved", () =>
      assertFails(
        updateDoc(ticket(db), {
          status: "RESOLVED",
          updatedAt: serverTimestamp(),
        }),
      ),
    );
    await pass("owner cannot spoof admin reply", () =>
      assertFails(reply(db, "owner", true, "forged")),
    );
    await pass("message alone cannot bypass ticket transaction", () =>
      assertFails(
        setDoc(doc(collection(ticket(db), "messages")), {
          body: "orphan",
          senderId: "owner",
          senderName: "owner",
          isAdmin: false,
          createdAt: serverTimestamp(),
          attachments: [],
        }),
      ),
    );
    await pass("admin reply atomically sets waiting", async () => {
      await assertSucceeds(reply(adb, "admin", true, "Please send details"));
      assert.equal((await getDoc(ticket(db))).data().status, "WAITING");
    });
    await pass("owner sees admin message", async () => {
      const m = await getDocs(collection(ticket(db), "messages"));
      assert.equal(m.size, 1);
      assert.equal(m.docs[0].data().isAdmin, true);
    });
    await pass("owner reply sets open", async () => {
      await assertSucceeds(reply(db, "owner", false, "Here are details"));
      assert.equal((await getDoc(ticket(db))).data().status, "OPEN");
    });
    await pass("two concurrent replies keep correct count", async () => {
      await Promise.all([
        reply(db, "owner", false, "one"),
        reply(adb, "admin", true, "two"),
      ]);
      assert.equal((await getDoc(ticket(db))).data().messageCount, 5);
    });
    await pass("admin can resolve", () =>
      assertSucceeds(
        updateDoc(ticket(adb), {
          status: "RESOLVED",
          updatedAt: serverTimestamp(),
        }),
      ),
    );
    await pass("closed conversation rejects reply", () =>
      assertFails(reply(db, "owner", false, "closed reply")),
    );
    await pass("owner can reopen", () =>
      assertSucceeds(
        updateDoc(ticket(db), { status: "OPEN", updatedAt: serverTimestamp() }),
      ),
    );
    await pass("owner can close", () =>
      assertSucceeds(
        updateDoc(ticket(db), {
          status: "CLOSED",
          updatedAt: serverTimestamp(),
        }),
      ),
    );
    await pass("admin can reopen", () =>
      assertSucceeds(
        updateDoc(ticket(adb), {
          status: "OPEN",
          updatedAt: serverTimestamp(),
        }),
      ),
    );
    await pass("ticket cannot be deleted", () =>
      assertFails(deleteDoc(ticket(db))),
    );
    await pass("existing messages immutable", async () => {
      const m = (await getDocs(collection(ticket(db), "messages"))).docs[0];
      await assertFails(updateDoc(m.ref, { body: "changed" }));
    });
    await pass("attachment path cannot impersonate another uploader", () =>
      assertFails(
        setDoc(ticket(db, "bad-file"), {
          ...ticketData(),
          attachments: [
            {
              name: "a.pdf",
              path: "supportAttachments/bad-file/other/file",
              size: 100,
              type: "application/pdf",
            },
          ],
        }),
      ),
    );
    await pass("upload supported file", () =>
      assertSucceeds(
        uploadBytes(
          ref(owner.storage(), "supportAttachments/ticket-test/owner/test.png"),
          new Uint8Array([137, 80, 78, 71]),
          { contentType: "image/png" },
        ),
      ),
    );
    await pass("admin downloads attachment", () =>
      assertSucceeds(
        getBytes(
          ref(admin.storage(), "supportAttachments/ticket-test/owner/test.png"),
        ),
      ),
    );
    await pass("another office cannot download attachment", () =>
      assertFails(
        getBytes(
          ref(other.storage(), "supportAttachments/ticket-test/owner/test.png"),
        ),
      ),
    );
    await pass("coworker cannot download attachment", () =>
      assertFails(
        getBytes(
          ref(
            coworker.storage(),
            "supportAttachments/ticket-test/owner/test.png",
          ),
        ),
      ),
    );
    await pass("reject executable attachment", () =>
      assertFails(
        uploadBytes(
          ref(owner.storage(), "supportAttachments/ticket-test/owner/test.exe"),
          new Uint8Array([1]),
          { contentType: "application/octet-stream" },
        ),
      ),
    );
    await pass("reject oversized attachment", () =>
      assertFails(
        uploadBytes(
          ref(
            owner.storage(),
            "supportAttachments/ticket-test/owner/large.png",
          ),
          new Uint8Array(5242881),
          { contentType: "image/png" },
        ),
      ),
    );
    await env.withSecurityRulesDisabled(async (context) => {
      for (let i = 0; i < 22; i++)
        await setDoc(ticket(context.firestore(), `page-${i}`), {
          ...ticketData(),
          createdAt: new Date(2026, 0, i + 1),
        });
    });
    await pass("cursor pagination bounded and no duplicates", async () => {
      const base = [
        where("createdBy", "==", "owner"),
        orderBy("createdAt", "desc"),
      ];
      const first = await getDocs(
        query(collection(db, "supportTickets"), ...base, limit(10)),
      );
      const second = await getDocs(
        query(
          collection(db, "supportTickets"),
          ...base,
          startAfter(first.docs.at(-1)),
          limit(10),
        ),
      );
      assert.equal(first.size, 10);
      assert.equal(second.size, 10);
      assert.equal(
        new Set([...first.docs, ...second.docs].map((d) => d.id)).size,
        20,
      );
    });
    console.log(`\n${checks} support integration checks passed.`);
  } finally {
    await env.cleanup();
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
