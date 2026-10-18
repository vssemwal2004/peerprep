// Static completion vocabulary for the practice languages: keywords, the
// library names students reach for in competitive programming, and common
// member names offered after `.`, `->` or `::`. Member names are not type
// checked; they are the usual methods of the standard containers and strings.

const words = (text) => text.split(/\s+/).filter(Boolean);

const C_KEYWORDS = words(`
  int long short char float double void unsigned signed const static struct enum union typedef
  if else for while do switch case default break continue return goto sizeof extern inline volatile
  register auto bool true false
`);

const CPP_KEYWORDS = words(`
  int long short char float double void bool auto unsigned signed const static struct enum union
  class public private protected virtual override final template typename using namespace typedef
  if else for while do switch case default break continue return goto sizeof new delete this
  true false nullptr inline constexpr explicit friend operator mutable noexcept decltype try catch throw
`);

const JAVA_KEYWORDS = words(`
  int long short byte char float double boolean void var final static public private protected
  class interface enum record extends implements abstract new this super instanceof import package
  if else for while do switch case default break continue return try catch finally throw throws
  true false null synchronized
`);

const PYTHON_KEYWORDS = words(`
  def class return if elif else for while in not and or is None True False import from as with
  try except finally raise pass break continue lambda yield global nonlocal assert del async await self
`);

const JS_KEYWORDS = words(`
  function const let var return if else for while do switch case default break continue new this
  class extends super import export from try catch finally throw typeof instanceof in of
  null undefined true false async await yield delete
`);

const TS_KEYWORDS = [...JS_KEYWORDS, ...words(`
  interface type enum implements public private protected readonly abstract as keyof
  number string boolean any unknown never void bigint symbol object
`)];

const C_LIBRARY = words(`
  printf scanf puts gets getchar putchar malloc calloc realloc free memset memcpy memmove
  strlen strcpy strncpy strcmp strncmp strcat strchr strstr qsort bsearch abs labs llabs
  sqrt pow floor ceil fabs fmax fmin INT_MAX INT_MIN LONG_MAX LONG_MIN LLONG_MAX LLONG_MIN
  NULL size_t EOF stdin stdout
`);

const CPP_LIBRARY = words(`
  std vector string map unordered_map set unordered_set multiset multimap pair tuple queue
  priority_queue stack deque list array bitset greater less sort stable_sort reverse max min swap
  abs accumulate lower_bound upper_bound binary_search unique fill iota next_permutation
  prev_permutation max_element min_element count count_if find find_if gcd lcm __gcd memset
  make_pair make_tuple to_string stoi stol stoll stod getline cin cout cerr endl printf scanf
  INT_MAX INT_MIN LLONG_MAX LLONG_MIN size_t numeric_limits ios_base sqrt pow floor ceil log2
  isdigit isalpha isalnum tolower toupper
`);

const JAVA_LIBRARY = words(`
  String Integer Long Double Boolean Character Math System List ArrayList LinkedList Map HashMap
  TreeMap LinkedHashMap Set HashSet TreeSet LinkedHashSet Queue Deque ArrayDeque PriorityQueue
  Stack Arrays Collections StringBuilder Scanner Iterator Comparator Objects Optional
  BufferedReader InputStreamReader
`);

const PYTHON_LIBRARY = words(`
  print len range enumerate zip map filter sorted reversed sum min max abs any all int str float
  bool list dict set tuple frozenset input open isinstance ord chr divmod pow round hash type super
  object iter next Counter defaultdict deque OrderedDict heapq heappush heappop heapify bisect
  bisect_left bisect_right math inf gcd sqrt collections itertools permutations combinations
  accumulate product functools lru_cache cache reduce List Optional Dict Tuple
`);

const JS_LIBRARY = words(`
  console Math Number String Array Object Map Set WeakMap JSON parseInt parseFloat Infinity NaN
  BigInt Symbol Promise isNaN isFinite Boolean Date RegExp Error
`);

const TS_LIBRARY = [...JS_LIBRARY, ...words('Record Partial Readonly Pick Omit ReadonlyArray')];

const CPP_MEMBERS = words(`
  push_back emplace_back pop_back push emplace pop top front back size empty clear begin end
  rbegin rend insert erase find count at substr length first second resize reserve assign
  append compare c_str find_first_of lower_bound upper_bound swap
`);

const JAVA_MEMBERS = words(`
  add addAll get set size isEmpty contains containsKey containsValue put putIfAbsent getOrDefault
  remove poll peek offer push pop keySet values entrySet getKey getValue length charAt substring
  indexOf lastIndexOf equals append insert reverse toString toCharArray sort max min abs pow sqrt
  println print printf MAX_VALUE MIN_VALUE valueOf parseInt asList fill clear iterator hasNext
  next stream compareTo split trim isDigit isLetter toUpperCase toLowerCase pollFirst pollLast
  peekFirst peekLast offerFirst offerLast addFirst addLast firstKey lastKey floorKey ceilingKey
`);

const PYTHON_MEMBERS = words(`
  append extend insert pop remove index count sort reverse copy clear keys values items get
  setdefault update add discard union intersection difference split join strip lstrip rstrip
  replace find startswith endswith lower upper isdigit isalpha isalnum format appendleft popleft
  most_common heappush heappop
`);

const JS_MEMBERS = words(`
  log push pop shift unshift slice splice map filter reduce forEach find findIndex includes
  indexOf join sort reverse concat length keys values entries has get set add delete size max min
  floor ceil abs sqrt pow trunc random split substring charAt charCodeAt toString trim startsWith
  endsWith repeat padStart fill some every flat fromCharCode from isArray stringify parse
`);

const VOCABULARY = {
  c: { keywords: C_KEYWORDS, library: C_LIBRARY, members: [] },
  cpp: { keywords: CPP_KEYWORDS, library: CPP_LIBRARY, members: CPP_MEMBERS },
  java: { keywords: JAVA_KEYWORDS, library: JAVA_LIBRARY, members: JAVA_MEMBERS },
  python: { keywords: PYTHON_KEYWORDS, library: PYTHON_LIBRARY, members: PYTHON_MEMBERS },
  javascript: { keywords: JS_KEYWORDS, library: JS_LIBRARY, members: JS_MEMBERS },
  typescript: { keywords: TS_KEYWORDS, library: TS_LIBRARY, members: JS_MEMBERS },
};

const EMPTY = { keywords: [], library: [], members: [] };

export function getLanguageVocabulary(languageId) {
  return VOCABULARY[String(languageId || '')] || EMPTY;
}
