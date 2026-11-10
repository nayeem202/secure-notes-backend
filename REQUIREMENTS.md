# Interview requirement checks

Source: Technical Interview Task: Secure Note-Taking Application.

| Requirement                          | Implementation and validation                                                                   |
| ------------------------------------ | ----------------------------------------------------------------------------------------------- |
| REST API and functional frontend     | Express API plus the standalone vanilla HTML/CSS/JavaScript frontend                            |
| User manages own notes               | Authentication and owner-scoped note use cases; API ownership tests                             |
| Admin inherits user permissions      | Admin can use the same own-note routes                                                          |
| Admin manages users                  | Add, update, remove, list and single-user routes protected by admin policies                    |
| Admin reads everyone's notes         | Admin note list and read; author-only changes remain enforced                                   |
| MongoDB and Mongoose                 | Infrastructure database adapters and explicit models                                            |
| JWT and secure password hashing      | Injected JWT and bcrypt adapters; algorithm/issuer/audience/expiry and password tests           |
| All list operations paginated        | Group lists and group-member lists are both bounded and paginated                               |
| Indexes declared with schema.index   | Five explicit schema indexes plus MongoDB's automatic ID indexes                                |
| No unnecessary indexes               | Exact-index-set and explain-plan tests                                                          |
| Interest grouping in one aggregate   | One aggregate call; paginated groups and paginated usernames                                    |
| User posts in one lookup pipeline    | One aggregate call with one lookup into Posts                                                   |
| Posts visible to everyone            | Public read routes; writes require the authenticated author                                     |
| Private user data                    | Public user-post lookup returns only username and public posts                                  |
| No template or frontend styling work | Existing functional frontend retained; changes only support the API contract and required views |

Clean Architecture boundaries and source-comment removal are additional project requirements requested by the candidate.
