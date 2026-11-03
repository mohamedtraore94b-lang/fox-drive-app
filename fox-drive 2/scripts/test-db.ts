/* Lance une base Postgres jetable pour essayer le serveur en local : affiche son adresse puis attend. */
import { NetlifyDB } from "@netlify/database-dev";
const ndb = new NetlifyDB();
console.log("DATABASE_URL=" + (await ndb.start()));
setInterval(() => {}, 1 << 30);
