/**
 * See all code examples: https://github.com/FlatFilers/flatfile-docs-kitchen-sink
 */

import { recordHook } from "@flatfile/plugin-record-hook";
import api from "@flatfile/api";
import axios from "axios";

export default function flatfileEventListener(listener) {
  listener.on("**", ({ topic }) => {
    console.log(`Received event: ${topic}`);
  });

  // validate and transform contacts
  listener.use(
    recordHook("contacts", (record) => {
      const firstName = record.get("firstName");
      if (typeof firstName === "string") {
        // transform a record
        record.set("firstName", firstName.toLowerCase());
      }

      const email = record.get("email");
      const validEmailAddress = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

      if (email !== null && !validEmailAddress.test(email)) {
        console.log("Invalid Email Address");
        // error out a record
        record.addError("email", "Invalid Email Address");
      }

      return record;
    })
  );

  // submit action
  listener.filter({ job: "workbook:submitAction" }, (configure) => {
    configure.on(
      "job:ready",
      async ({ context: { jobId, workbookId }, payload }) => {
        const { data: sheets } = await api.sheets.list({ workbookId });

        const records = {};
        for (const [index, element] of sheets.entries()) {
          records[`Sheet[${index}]`] = await api.records.get(element.id);
        }

        try {
          await api.jobs.ack(jobId, {
            info: "Starting job to submit action to webhook.site",
            progress: 10,
          });

          const webhookReceiver = process.env.WEBHOOK_SITE_URL;

          // Here is where to submit to sundial_api
          // TODO: discuss interface with Alex
          const response = await axios.post(
            webhookReceiver,
            {
              ...payload,
              method: "axios",
              sheets,
              records,
            },
            {
              headers: {
                "Content-Type": "application/json",
              },
            }
          );

          if (response.status === 200) {
            await api.jobs.complete(jobId, {
              outcome: {
                message:
                  "Data was successfully submitted to webhook.site. Go check it out at " +
                  webhookReceiver +
                  ".",
              },
            });
          } else {
            throw new Error("Failed to submit data to webhook.site");
          }
        } catch (error) {
          console.log(`webhook.site[error]: ${JSON.stringify(error, null, 2)}`);

          await api.jobs.fail(jobId, {
            outcome: {
              message:
                "This job failed probably because it couldn't find the webhook.site URL.",
            },
          });
        }
      }
    );
  });
}

// You can see the full example used in our getting started guide in ./full-example.js
