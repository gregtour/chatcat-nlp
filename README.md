## ChatCat

This program implements a simple, anonymous chat engine, wherein users can enter a search query for the topic they wish to talk about and are then paired with similar people.

Slides explaining the motivation are included as well as a write-up of the project.

Code is provided in the dictionary.js, client.js and server.js files. The server side code is designed to be used with Node.js to extract semantic information from a text corpus. Some example sources include the dictionary, an encyclopedia, or online message boards.

After analyzing a set of texts, the chat engine is ready to accept search queries. Running on a Node.js server, the program accepts queries and then compares them to the set of active users. A user can then communicate with another person with a set of chat window tabs at the bottom of the screen, while still being allowed to make additional searches, which show up as a list of results.

The client application is implemented with HTML, CSS, and JavaScript as well as using the open source library socket.io to handle asynchronous communication with the server. The client simply relays messages to the server and displays an interface for the user.

The project is intended as a prototype of the language and search model, so it may not scale adequately, especially given limitations in JavaScript and Node.js. Dictionary files resulting from using one or two text corpuses tend to be well over 512 MB in size, which can reach a certain memory limitation. The speed at which the program runs is also not suited for greater than 100 users or so. If enough testing is done, it might be seen that the model for matching related searches is adequate and the server side application could be reimplemented in C++ for much superior performance.

Overall, it is a relatively simple project and the sum of all of the code is less than 1,500 lines of code.

An explanation of the natural language model:

In natural English speech, the occurrence of words tends to match words of similar semantic or contextual meaning. This provides one way in which synonyms or related words can be recognized. Even the simplest way of identifying the context and meaning of general words and proper nouns can be made by matching the keywords of encyclopedia entries of any given topic. This also, depending on the source, helps identify colloquial phrases and idiomatic usage of words.

After pre-processing this input dictionary, a score can be made comparing two searches by summing the relatedness of each input keyword. This can be found by taking the number of co-occurrences of these two keywords in sliding windows of the dictionary text, and dividing this number by the number of occurrences of each word individually, to filter out their conditional probability of occurring, and using a logarithmic adjustment due to the distribution of words in general.